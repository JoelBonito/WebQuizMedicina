"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logTokenUsage = void 0;
const admin = __importStar(require("firebase-admin"));
// Custos do Gemini 1.5 Flash (USD por 1M tokens)
// Atualizado em: Novembro 2024
const COSTS = {
    INPUT_PER_1M: 0.075,
    OUTPUT_PER_1M: 0.30
};
async function logTokenUsage(userId, projectId, operationType, inputTokens, outputTokens, model, metadata = {}) {
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
    }
    catch (error) {
        console.error("Erro ao registrar uso de tokens:", error);
        // Não lançar erro para não interromper o fluxo principal
    }
}
exports.logTokenUsage = logTokenUsage;
//# sourceMappingURL=token_usage.js.map