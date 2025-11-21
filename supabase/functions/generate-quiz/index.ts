import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { generateContent } from "../_shared/gemini.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { sourceId, projectId, content } = await req.json();

    // 1. Validação básica
    if (!content && !sourceId) {
      throw new Error("Conteúdo ou Source ID necessário");
    }

    // 2. Prepara o prompt com REGRAS RIGOROSAS de formato
    const prompt = `
      Você é um professor universitário especialista em medicina criando um quiz.
      
      Baseado no texto fornecido, crie 5 perguntas de múltipla escolha.
      
      REGRAS CRÍTICAS DE FORMATO (OBRIGATÓRIO):
      1. Crie APENAS perguntas de "Escolha Simples" (apenas UMA alternativa correta).
      2. NUNCA, em hipótese alguma, crie perguntas do tipo "Cite 3 exemplos", "Selecione todas as corretas" ou "Quais das opções abaixo estão certas".
      3. Se o texto listar 3 sintomas (ex: Febre, Tosse, Dor), NÃO pergunte "Quais são os 3 sintomas?". Pergunte: "Qual destes é um sintoma principal?" e coloque apenas um deles como correto, e os outros 3 como distratores (errados).
      4. Cada pergunta deve ter EXATAMENTE 4 alternativas (A, B, C, D).
      5. A resposta correta deve ser APENAS a letra (ex: "A", "B").
      
      Gere a resposta estritamente neste formato JSON:
      [
        {
          "pergunta": "Texto da pergunta aqui?",
          "opcoes": ["A) Opção 1", "B) Opção 2", "C) Opção 3", "D) Opção 4"],
          "resposta_correta": "A",
          "justificativa": "Explicação detalhada do porquê A está correta e as outras erradas.",
          "dificuldade": "médio",
          "topico": "Cardiologia",
          "dica": "Uma dica sutil para ajudar o aluno."
        }
      ]

      Texto base para o quiz:
      "${content.substring(0, 15000)}" // Limite para não estourar tokens
    `;

    // 3. Chama o Gemini
    const generatedText = await generateContent(prompt);
    
    // 4. Limpeza do JSON (caso a IA mande markdown ```json ... ```)
    let jsonStr = generatedText.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```json\s*/, "").replace(/^```\s*/, "").replace(/```$/, "");
    }

    const questions = JSON.parse(jsonStr);

    // 5. Salva no Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL") as string;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const questionsToInsert = questions.map((q: any) => ({
      project_id: projectId,
      source_id: sourceId || null,
      pergunta: q.pergunta,
      opcoes: q.opcoes,
      resposta_correta: q.resposta_correta.trim().toUpperCase().charAt(0), // Garante que é só a letra
      justificativa: q.justificativa,
      dificuldade: q.dificuldade || "médio",
      topico: q.topico || "Geral",
      dica: q.dica || null,
    }));

    const { error } = await supabase.from("questions").insert(questionsToInsert);

    if (error) throw error;

    return new Response(JSON.stringify({ success: true, data: questionsToInsert }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
