import * as admin from "firebase-admin";

// Custos do Gemini 1.5 Flash (USD por 1M tokens)
// Atualizado em: Novembro 2024
const COSTS = {
    INPUT_PER_1M: 0.075,
    OUTPUT_PER_1M: 0.30
};

export async function logTokenUsage(
    userId: string,
    projectId: string,
    operationType: string,
    inputTokens: number,
    outputTokens: number,
    model: string,
    metadata: any = {}
) {
    const db = admin.firestore();
    const totalTokens = inputTokens + outputTokens;

    const inputCost = (inputTokens / 1000000) * COSTS.INPUT_PER_1M;
    const outputCost = (outputTokens / 1000000) * COSTS.OUTPUT_PER_1M;
    const totalCost = inputCost + outputCost;

    try {
        await db.collection("token_usage").add({
            user_id: userId,
            project_id: projectId,
            operation_type: operationType,
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            total_tokens: totalTokens,
            total_cost: totalCost,
            model: model,
            metadata: metadata,
            created_at: admin.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        console.error("Erro ao registrar uso de tokens:", error);
        // Não lançar erro para não interromper o fluxo principal
    }
}
