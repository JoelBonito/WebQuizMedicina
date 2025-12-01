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
exports.sanitizeData = exports.COLLECTIONS = exports.db = void 0;
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("firebase-admin/firestore");
// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
    admin.initializeApp();
}
exports.db = (0, firestore_1.getFirestore)();
exports.COLLECTIONS = {
    USERS: 'users',
    SOURCES: 'sources',
    QUESTIONS: 'questions',
    FLASHCARDS: 'flashcards',
    MINDMAPS: 'mindmaps',
    SUMMARIES: 'summaries',
    CHAT_SESSIONS: 'chat_sessions',
    AUDIT_LOGS: 'audit_logs',
    TOKEN_USAGE_LOGS: 'token_usage_logs',
};
// Helper to sanitize data before saving to Firestore (remove undefined)
function sanitizeData(data) {
    return JSON.parse(JSON.stringify(data));
}
exports.sanitizeData = sanitizeData;
//# sourceMappingURL=firestore.js.map