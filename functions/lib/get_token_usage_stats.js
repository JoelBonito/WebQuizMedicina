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
exports.get_token_usage_stats = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
// Taxa de conversão USD para BRL (aproximada, pode ser atualizada)
const USD_TO_BRL_RATE = 5.5;
function convertCostToBRL(costUSD) {
    return costUSD * USD_TO_BRL_RATE;
}
exports.get_token_usage_stats = (0, https_1.onCall)({
    timeoutSeconds: 60,
    memory: "256MiB",
    region: "us-central1"
}, async (request) => {
    const db = admin.firestore();
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be authenticated");
    }
    const { action, start_date, end_date } = request.data;
    const userId = request.auth.uid;
    // Parse dates
    const start = start_date ? new Date(start_date) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = end_date ? new Date(end_date) : new Date();
    try {
        // Verificar se é admin
        const userProfileSnap = await db.collection("user_profiles").doc(userId).get();
        const userProfile = userProfileSnap.data();
        const isAdmin = (userProfile === null || userProfile === void 0 ? void 0 : userProfile.role) === 'admin';
        let query = db.collection("token_usage")
            .where("created_at", ">=", start)
            .where("created_at", "<=", end);
        // Restringir aos dados do usuário atual SE NÃO FOR ADMIN
        if (!isAdmin) {
            query = query.where("user_id", "==", userId);
        }
        const snapshot = await query.get();
        const usageData = snapshot.docs.map(doc => doc.data());
        switch (action) {
            case "get_token_usage_by_user":
                if (isAdmin) {
                    return await calculateUsageGroupedByUser(usageData, db);
                }
                return calculateUserUsage(usageData, userId);
            case "get_token_usage_by_project":
                return calculateProjectUsage(usageData, db);
            case "get_daily_usage":
                return calculateDailyUsage(usageData);
            case "get_token_usage_summary":
                return calculateSummary(usageData);
            default:
                throw new https_1.HttpsError("invalid-argument", `Ação desconhecida: ${action}`);
        }
    }
    catch (error) {
        console.error("Erro em get_token_usage_stats:", error);
        throw new https_1.HttpsError("internal", error.message);
    }
});
async function calculateUsageGroupedByUser(data, db) {
    const userMap = {};
    // Agrupar dados
    data.forEach(item => {
        const uid = item.user_id || 'unknown';
        if (!userMap[uid]) {
            userMap[uid] = {
                total_tokens: 0,
                total_cost: 0,
                operation_counts: {},
                last_active: null
            };
        }
        userMap[uid].total_tokens += item.total_tokens || 0;
        userMap[uid].total_cost += item.total_cost || 0;
        const op = item.operation_type || 'unknown';
        userMap[uid].operation_counts[op] = (userMap[uid].operation_counts[op] || 0) + 1;
        // Track last active date
        if (item.created_at) {
            const date = item.created_at.toDate();
            if (!userMap[uid].last_active || date > userMap[uid].last_active) {
                userMap[uid].last_active = date;
            }
        }
    });
    // Buscar perfis de usuário para enriquecer os dados
    const userIds = Object.keys(userMap);
    const profilesMap = {};
    if (userIds.length > 0) {
        // Firestore 'in' query supports up to 10 items. If more, we might need multiple queries or just fetch all.
        // Assuming low number of users for now, or fetch all user_profiles since it's an admin view.
        const profilesSnap = await db.collection("user_profiles").get();
        profilesSnap.forEach(doc => {
            profilesMap[doc.id] = doc.data();
        });
    }
    return Object.entries(userMap).map(([uid, stats]) => {
        var _a, _b, _c;
        return ({
            user_id: uid,
            display_name: ((_a = profilesMap[uid]) === null || _a === void 0 ? void 0 : _a.display_name) || ((_b = profilesMap[uid]) === null || _b === void 0 ? void 0 : _b.email) || 'Usuário Desconhecido',
            user_email: ((_c = profilesMap[uid]) === null || _c === void 0 ? void 0 : _c.email) || '',
            total_tokens: stats.total_tokens,
            total_cost: stats.total_cost,
            total_cost_brl: convertCostToBRL(stats.total_cost),
            operation_counts: stats.operation_counts,
            last_active: stats.last_active ? stats.last_active.toISOString() : null
        });
    });
}
function calculateUserUsage(data, userId) {
    let totalTokens = 0;
    let totalCost = 0;
    const operationCounts = {};
    let lastActive = null;
    data.forEach(item => {
        totalTokens += item.total_tokens || 0;
        totalCost += item.total_cost || 0;
        const op = item.operation_type || 'unknown';
        operationCounts[op] = (operationCounts[op] || 0) + 1;
        if (item.created_at) {
            const date = item.created_at.toDate();
            if (!lastActive || date > lastActive) {
                lastActive = date;
            }
        }
    });
    return [{
            user_id: userId,
            total_tokens: totalTokens,
            total_cost: totalCost,
            total_cost_brl: convertCostToBRL(totalCost),
            operation_counts: operationCounts,
            last_active: lastActive ? lastActive.toISOString() : null
        }];
}
async function calculateProjectUsage(data, db) {
    const projectMap = {};
    const projectIdsToFetch = new Set();
    data.forEach(item => {
        var _a, _b;
        const pid = item.project_id || 'unknown';
        // Se pid for unknown (null no banco), rotular como Sem Projeto
        let initialName = 'Projeto Desconhecido';
        if (pid === 'unknown') {
            initialName = 'Sem Projeto / Global';
        }
        else {
            projectIdsToFetch.add(pid);
        }
        if (!projectMap[pid]) {
            projectMap[pid] = {
                total_tokens: 0,
                total_cost: 0,
                total_input_tokens: 0,
                total_output_tokens: 0,
                project_name: ((_a = item.metadata) === null || _a === void 0 ? void 0 : _a.project_name) || initialName,
                operation_counts: {}
            };
        }
        projectMap[pid].total_tokens += item.total_tokens || 0;
        projectMap[pid].total_cost += item.total_cost || 0;
        projectMap[pid].total_input_tokens += item.tokens_input || 0;
        projectMap[pid].total_output_tokens += item.tokens_output || 0;
        // Tentar pegar nome do projeto se disponível no metadata
        if ((_b = item.metadata) === null || _b === void 0 ? void 0 : _b.project_name) {
            projectMap[pid].project_name = item.metadata.project_name;
        }
        const op = item.operation_type || 'unknown';
        projectMap[pid].operation_counts[op] = (projectMap[pid].operation_counts[op] || 0) + 1;
    });
    // Fetch project names for unknown projects
    const ids = Array.from(projectIdsToFetch);
    if (ids.length > 0) {
        // Firestore 'in' query limit is 10. We'll fetch in batches or just fetch individually if needed.
        // For simplicity and robustness with larger sets, let's fetch individually or in small batches.
        // Given this is an admin dashboard, fetching all projects might be better if there are many, 
        // but let's stick to fetching needed ones.
        const chunkSize = 10;
        for (let i = 0; i < ids.length; i += chunkSize) {
            const chunk = ids.slice(i, i + chunkSize);
            if (chunk.length === 0)
                continue;
            try {
                const projectsSnap = await db.collection("projects")
                    .where(admin.firestore.FieldPath.documentId(), "in", chunk)
                    .get();
                projectsSnap.forEach(doc => {
                    const projectData = doc.data();
                    const pid = doc.id;
                    // Only update if it's currently unknown or we want to ensure latest name
                    if (projectMap[pid] && (projectMap[pid].project_name === 'Projeto Desconhecido' || !projectMap[pid].project_name)) {
                        projectMap[pid].project_name = projectData.name || projectData.title || 'Sem Nome';
                    }
                });
            }
            catch (err) {
                console.error("Error fetching project names:", err);
            }
        }
    }
    return Object.entries(projectMap).map(([projectId, stats]) => ({
        project_id: projectId,
        project_name: stats.project_name,
        total_tokens: stats.total_tokens,
        total_input_tokens: stats.total_input_tokens,
        total_output_tokens: stats.total_output_tokens,
        total_cost: stats.total_cost,
        total_cost_brl: convertCostToBRL(stats.total_cost),
        operation_counts: stats.operation_counts
    }));
}
function calculateDailyUsage(data) {
    const dailyMap = {};
    data.forEach(item => {
        if (!item.created_at)
            return;
        const date = item.created_at.toDate().toISOString().split('T')[0]; // YYYY-MM-DD
        if (!dailyMap[date]) {
            dailyMap[date] = { total_tokens: 0, total_cost: 0, unique_users: new Set() };
        }
        dailyMap[date].total_tokens += item.total_tokens || 0;
        dailyMap[date].total_cost += item.total_cost || 0;
        if (item.user_id)
            dailyMap[date].unique_users.add(item.user_id);
    });
    return Object.entries(dailyMap).map(([date, stats]) => ({
        date,
        total_tokens: stats.total_tokens,
        total_cost: stats.total_cost,
        total_cost_brl: convertCostToBRL(stats.total_cost),
        unique_users: stats.unique_users.size
    })).sort((a, b) => a.date.localeCompare(b.date));
}
function calculateSummary(data) {
    let totalTokens = 0;
    let totalCost = 0;
    const uniqueUsers = new Set();
    const operationCounts = {};
    data.forEach(item => {
        totalTokens += item.total_tokens || 0;
        totalCost += item.total_cost || 0;
        if (item.user_id)
            uniqueUsers.add(item.user_id);
        const op = item.operation_type || 'unknown';
        operationCounts[op] = (operationCounts[op] || 0) + 1;
    });
    // Encontrar operação mais usada
    let mostUsedOp = '';
    let maxCount = 0;
    Object.entries(operationCounts).forEach(([op, count]) => {
        if (count > maxCount) {
            maxCount = count;
            mostUsedOp = op;
        }
    });
    return {
        total_tokens: totalTokens,
        total_cost: totalCost,
        total_cost_brl: convertCostToBRL(totalCost),
        total_requests: data.length,
        total_operations: data.length,
        active_users: uniqueUsers.size,
        avg_tokens_per_operation: data.length > 0 ? totalTokens / data.length : 0,
        most_used_operation: mostUsedOp
    };
}
//# sourceMappingURL=get_token_usage_stats.js.map