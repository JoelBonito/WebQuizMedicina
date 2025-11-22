# 🧪 TESTING GUIDE - Phase 4 Complete (Recovery Mode)

**Created:** 2025-11-22
**Components:** Frontend Integration + Backend (4A, 4B, 4C)
**Features:** Recovery Quiz, Recovery Flashcards, Auto-Resolution, Taxonomy

---

## 📋 Overview

Phase 4 implements a complete **Recovery Mode** system with:

- **Phase 4A:** Recovery Quiz with adaptive strategies (Mastery/Hybrid/Focused)
- **Phase 4B:** Recovery Flashcards with atomization (1 card = 1 fact)
- **Phase 4C:** Auto-resolution after 3 consecutive correct answers + topic taxonomy
- **Frontend:** Dashboard UI with streak progress, recovery buttons, and auto-resolve notifications

---

## 🎯 Frontend Components

### 1. Updated `useDifficulties.ts` Hook

**New Fields in Difficulty Interface:**
```typescript
export interface Difficulty {
  // ... existing fields
  consecutive_correct?: number;     // 0-3 streak counter
  last_attempt_at?: string;         // Last answer timestamp
  auto_resolved_at?: string;        // Auto-resolution timestamp
}

export interface DifficultyStatistics {
  total: number;
  resolved: number;
  unresolved: number;
  autoResolved: number;
  averageStreak: number;
}
```

**New Functions:**
```typescript
// Get statistics (including auto-resolved count)
const stats = await getStatistics();

// Check auto-resolve after recovery quiz/flashcard answer
const result = await checkAutoResolve('Insulina', true);
// Returns: { difficulty_found, consecutive_correct, auto_resolved, threshold }

// Normalize topic using taxonomy
const normalized = await normalizeTopic('DM1');
// Returns: 'Diabetes Mellitus Tipo 1'
```

### 2. Updated `DifficultiesPanel.tsx`

**New UI Features:**

✅ **Streak Progress Badges:** Each active difficulty shows ⭐⭐☆ (2/3) progress
✅ **Recovery Quiz Button:** Generates adaptive quiz based on difficulties
✅ **Recovery Flashcards Button:** Generates atomized flashcards
✅ **Auto-Resolved Badge:** Resolved difficulties show "Auto-Resolvido" badge
✅ **3-Button Layout:** Resumo Focado | Recovery Quiz | Recovery Flashcards

---

## 🧪 Testing Scenarios

### Scenario 1: Complete Recovery Flow

**Goal:** Test the full cycle from difficulty detection to auto-resolution

**Steps:**

1. **Create Difficulties:**
```sql
-- Insert test difficulties
INSERT INTO difficulties (user_id, project_id, topico, tipo_origem, nivel, resolvido, consecutive_correct)
VALUES
  ('YOUR_USER_ID', 'YOUR_PROJECT_ID', 'Insulina', 'quiz', 3, false, 0),
  ('YOUR_USER_ID', 'YOUR_PROJECT_ID', 'Cetoacidose Diabética', 'flashcard', 5, false, 1),
  ('YOUR_USER_ID', 'YOUR_PROJECT_ID', 'Hipertensão', 'chat', 2, false, 2);
```

2. **Open DifficultiesPanel:**
   - Should see 3 active difficulties
   - "Hipertensão" should show ⭐⭐☆ (2/3 progress)
   - "Cetoacidose" should show ⭐☆☆ (1/3 progress)
   - "Insulina" should show no streak (0/3)

3. **Generate Recovery Quiz:**
   - Click "Recovery Quiz" button
   - Should show toast: "🎯 Gerando Recovery Quiz sobre: Insulina, Cetoacidose Diabética, Hipertensão..."
   - Toast success: "✅ Recovery Quiz gerado! Estratégia: FOCUSED (100% foco)"
   - Should show 10 questions distributed across all 3 topics

4. **Answer Recovery Quiz:**
   ```typescript
   // In QuizPanel, when saving progress, call:
   await checkAutoResolve('Hipertensão', true);
   // Should return: { difficulty_found: true, consecutive_correct: 3, auto_resolved: true }
   ```

5. **Verify Auto-Resolution:**
   - "Hipertensão" should disappear from active list
   - Should appear in "Resolvidas" section with "Auto-Resolvido" badge
   - Toast: "🎉 Dificuldade 'Hipertensão' resolvida automaticamente! (3/3 corretas)"

6. **Test Streak Reset:**
   ```typescript
   // Answer incorrectly
   await checkAutoResolve('Cetoacidose Diabética', false);
   // Should return: { consecutive_correct: 0 } (reset)
   ```
   - Badge should change from ⭐☆☆ to no badge

---

### Scenario 2: Topic Normalization

**Goal:** Test taxonomy normalization

**Steps:**

1. **Test Synonym Matching:**
```typescript
// In browser console or test
const { data } = await supabase.functions.invoke('manage-difficulties', {
  body: { action: 'normalize_topic', topic: 'DM1' }
});
console.log(data.normalized); // Should be: 'Diabetes Mellitus Tipo 1'

// Test more synonyms
normalizeTopic('Coração');      // → 'Cardiologia'
normalizeTopic('HAS');           // → 'Hipertensão'
normalizeTopic('IC');            // → 'Insuficiência Cardíaca'
normalizeTopic('CAD');           // → 'Cetoacidose Diabética'
normalizeTopic('HbA1c');         // → 'Hemoglobina Glicada'
```

2. **Test Auto-Resolve with Normalized Topic:**
```sql
-- Create difficulty with synonym
INSERT INTO difficulties (user_id, project_id, topico, tipo_origem, nivel, resolvido)
VALUES ('USER_ID', 'PROJECT_ID', 'DM1', 'quiz', 2, false);
```

```typescript
// Answer with canonical term (should still work)
await checkAutoResolve('Diabetes Mellitus Tipo 1', true);
// Should find the 'DM1' difficulty and increment streak
```

---

### Scenario 3: Adaptive Strategies

**Goal:** Test all 3 recovery strategies

**Case A: MASTERY Mode (0 difficulties)**
```sql
-- Delete all difficulties
DELETE FROM difficulties WHERE user_id = 'USER_ID';
```
- Click "Recovery Quiz"
- Should show toast: "Estratégia: MASTERY (0% foco)"
- Questions should be advanced/conceptual

**Case B: HYBRID Mode (1-2 difficulties)**
```sql
INSERT INTO difficulties (user_id, project_id, topico, tipo_origem, nivel, resolvido)
VALUES ('USER_ID', 'PROJECT_ID', 'Insulina', 'quiz', 3, false);
```
- Click "Recovery Quiz"
- Should show toast: "Estratégia: HYBRID (40% foco)"
- 40% questions about Insulina, 60% general medicine

**Case C: FOCUSED Mode (3+ difficulties)**
```sql
INSERT INTO difficulties (user_id, project_id, topico, tipo_origem, nivel, resolvido)
VALUES
  ('USER_ID', 'PROJECT_ID', 'Insulina', 'quiz', 3, false),
  ('USER_ID', 'PROJECT_ID', 'Cetoacidose', 'quiz', 5, false),
  ('USER_ID', 'PROJECT_ID', 'Hipertensão', 'quiz', 2, false);
```
- Click "Recovery Quiz"
- Should show toast: "Estratégia: FOCUSED (100% foco)"
- All questions distributed across the 3 topics

---

### Scenario 4: Flashcard Atomization

**Goal:** Verify flashcards are atomic (1 card = 1 fact)

**Steps:**

1. **Generate Recovery Flashcards:**
   - Click "Recovery Flashcards" button
   - Should generate 20 flashcards

2. **Verify Atomization:**
   - Each flashcard should have:
     - **Frente:** Short question (1 sentence max)
     - **Verso:** Concise answer (1-3 sentences max)
   - NO complex multi-step explanations

**Good Examples:**
```
Frente: "Qual o primeiro passo no tratamento da cetoacidose diabética?"
Verso: "Hidratação vigorosa com Soro Fisiológico 0,9% (1-2L na primeira hora)."

Frente: "Qual tipo de insulina usar na cetoacidose diabética?"
Verso: "Insulina REGULAR por via IV (dose: 0,1 UI/kg/h em infusão contínua)."
```

**Bad Examples (should NOT happen):**
```
Frente: "Explique o tratamento completo da cetoacidose diabética"
Verso: "Hidratação com SF 0,9%, insulina regular IV, correção de K+, correção de acidose..."
```

---

## 📊 SQL Monitoring Queries

### Check Auto-Resolution Progress
```sql
SELECT
  topico,
  consecutive_correct,
  last_attempt_at,
  resolvido,
  auto_resolved_at,
  CASE
    WHEN consecutive_correct >= 3 THEN '🎉 Should auto-resolve'
    WHEN consecutive_correct = 2 THEN '⭐⭐☆ Almost there!'
    WHEN consecutive_correct = 1 THEN '⭐☆☆ Getting started'
    ELSE '☆☆☆ No progress'
  END as status
FROM difficulties
WHERE user_id = 'YOUR_USER_ID'
  AND project_id = 'YOUR_PROJECT_ID'
ORDER BY consecutive_correct DESC, nivel DESC;
```

### Statistics Dashboard
```sql
SELECT
  COUNT(*) FILTER (WHERE NOT resolvido) as active_difficulties,
  COUNT(*) FILTER (WHERE resolvido) as resolved_total,
  COUNT(*) FILTER (WHERE auto_resolved_at IS NOT NULL) as auto_resolved,
  COUNT(*) FILTER (WHERE resolvido AND auto_resolved_at IS NULL) as manually_resolved,
  ROUND(AVG(consecutive_correct), 2) as avg_streak,
  MAX(consecutive_correct) as max_streak
FROM difficulties
WHERE user_id = 'YOUR_USER_ID'
  AND project_id = 'YOUR_PROJECT_ID';
```

### Taxonomy Coverage
```sql
SELECT
  canonical_term,
  category,
  array_length(synonyms, 1) as synonym_count,
  synonyms
FROM difficulty_taxonomy
ORDER BY category, canonical_term;
```

---

## 🎨 UI Visual Checks

### DifficultiesPanel Layout

```
┌─────────────────────────────────────────────────┐
│  📊 Dashboard de Dificuldades                   │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐               │
│  │Total│ │Críti│ │Moder│ │Resol│               │
│  │  3  │ │  1  │ │  2  │ │  5  │               │
│  └─────┘ └─────┘ └─────┘ └─────┘               │
│                                                  │
│  ✨ Conteúdo Personalizado                      │
│  Focado nos seus 3 tópicos mais difíceis       │
│  [Insulina] [Cetoacidose] [Hipertensão]        │
│                                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │  Resumo  │ │ Recovery │ │ Recovery │        │
│  │  Focado  │ │   Quiz   │ │Flashcards│        │
│  │  Estude  │ │Adaptativo│ │ Atomizado│        │
│  └──────────┘ └──────────┘ └──────────┘        │
│                                                  │
│  ⚠️ Dificuldades Ativas (3)                     │
│  ┌─────────────────────────────────────────┐   │
│  │ Insulina    [Nível 3] [Quiz]            │   │
│  │ ⭐⭐☆ 2/3 Progresso de Auto-Resolução    │   │
│  │ ████████░░ 80%                          │   │
│  └─────────────────────────────────────────┘   │
│                                                  │
│  ✅ Resolvidas (5)                              │
│  ┌─────────────────────────────────────────┐   │
│  │ ✓ Hipertensão [Nível 2] ⭐Auto-Resolvido│   │
│  └─────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

### Streak Badge Colors
- **⭐⭐⭐ (3/3):** Should auto-resolve immediately (not visible, goes to resolved)
- **⭐⭐☆ (2/3):** Yellow background, yellow stars, visible
- **⭐☆☆ (1/3):** Yellow background, yellow stars, visible
- **☆☆☆ (0/3):** No badge shown

### Auto-Resolved Badge
- Background: `bg-yellow-100`
- Text: `text-yellow-800`
- Border: `border-yellow-300`
- Icon: Yellow star (filled)

---

## 🐛 Common Issues & Fixes

### Issue 1: Streak Not Updating

**Symptom:** `consecutive_correct` stays at 0

**Debug:**
```sql
SELECT * FROM difficulties
WHERE topico = 'YOUR_TOPIC'
AND user_id = 'YOUR_USER_ID';
```

**Fix:**
- Ensure `checkAutoResolve()` is called after EACH recovery quiz/flashcard answer
- Verify topic normalization is working (use exact normalized topic)

### Issue 2: Auto-Resolution Not Happening

**Symptom:** Difficulty stays active at 3/3 streak

**Debug:**
```sql
-- Check if function is working
SELECT public.check_auto_resolve_difficulty(
  'USER_ID'::uuid,
  'PROJECT_ID'::uuid,
  'Insulina',
  true
);
```

**Fix:**
- Verify SQL function is created (check migration 019)
- Ensure `resolvido = false` before calling function
- Check database logs for errors

### Issue 3: Taxonomy Not Normalizing

**Symptom:** Topics not being normalized

**Debug:**
```sql
-- Test normalization function
SELECT public.normalize_difficulty_topic('DM1');
-- Should return: 'Diabetes Mellitus Tipo 1'
```

**Fix:**
- Verify taxonomy table has data: `SELECT * FROM difficulty_taxonomy;`
- Ensure synonyms are lowercase in comparison
- Add missing terms to taxonomy

### Issue 4: Recovery Buttons Not Working

**Symptom:** Click button, nothing happens

**Debug:**
```javascript
// Check edge function
const { data, error } = await supabase.functions.invoke('generate-recovery-quiz', {
  body: { project_id: 'PROJECT_ID', count: 10 }
});
console.log(data, error);
```

**Fix:**
- Verify edge functions are deployed: `supabase functions list`
- Check browser console for errors
- Ensure project has sources with embeddings

---

## 📈 Success Metrics

After implementing Phase 4, you should see:

✅ **Auto-Resolution Rate:** 60-80% of difficulties resolved automatically
✅ **Manual Resolution Reduction:** 90% fewer manual "Resolver" clicks
✅ **Topic Normalization:** 90% of synonyms correctly normalized
✅ **Recovery Engagement:** 50%+ increase in recovery quiz/flashcard usage
✅ **Streak Progress:** Average streak of 1.5-2.0 (students actively working on recovery)

---

## 🚀 Next Steps (Optional Enhancements)

1. **Push Notifications:** Alert user when streak reaches 2/3
2. **Celebration Animation:** Confetti when difficulty auto-resolves
3. **Weekly Report:** Email summary of auto-resolved difficulties
4. **Taxonomy Editor:** Admin UI to add/edit taxonomy entries
5. **Difficulty Heatmap:** Visual calendar showing resolution progress

---

## 📝 Testing Checklist

- [ ] Difficulty streak badges render correctly (⭐⭐☆)
- [ ] Recovery Quiz generates with correct strategy
- [ ] Recovery Flashcards are atomic (1 fact per card)
- [ ] Auto-resolution triggers at 3/3 streak
- [ ] Auto-resolved badge appears in resolved section
- [ ] Streak resets on incorrect answer
- [ ] Topic normalization works for all synonyms
- [ ] 3-button layout (Resumo, Quiz, Flashcards) renders properly
- [ ] Toast notifications show strategy and focus percentage
- [ ] Statistics API returns correct counts

---

**Last Updated:** 2025-11-22
**Status:** ✅ Complete
**Next Phase:** User Acceptance Testing (UAT)
