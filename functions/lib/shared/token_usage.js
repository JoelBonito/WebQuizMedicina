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
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.logTokenUsage = logTokenUsage;
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
//# sourceMappingURL=token_usage.js.map