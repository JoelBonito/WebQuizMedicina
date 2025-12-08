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
exports.delete_flashcard_session = exports.delete_quiz_session = exports.get_token_usage_stats = exports.generate_recovery_quiz = exports.generate_recovery_flashcards = exports.generate_focused_summary = exports.generate_mindmap = exports.process_embeddings_queue = exports.manage_difficulties = exports.generate_summary = exports.chat = exports.generate_flashcards = exports.generate_quiz = void 0;
const admin = __importStar(require("firebase-admin"));
// Initialize Firebase Admin SDK once
if (!admin.apps.length) {
    admin.initializeApp();
}
// Export functions
var generate_quiz_1 = require("./generate_quiz");
Object.defineProperty(exports, "generate_quiz", { enumerable: true, get: function () { return generate_quiz_1.generate_quiz; } });
var generate_flashcards_1 = require("./generate_flashcards");
Object.defineProperty(exports, "generate_flashcards", { enumerable: true, get: function () { return generate_flashcards_1.generate_flashcards; } });
var chat_1 = require("./chat");
Object.defineProperty(exports, "chat", { enumerable: true, get: function () { return chat_1.chat; } });
var generate_summary_1 = require("./generate_summary");
Object.defineProperty(exports, "generate_summary", { enumerable: true, get: function () { return generate_summary_1.generate_summary; } });
var manage_difficulties_1 = require("./manage_difficulties");
Object.defineProperty(exports, "manage_difficulties", { enumerable: true, get: function () { return manage_difficulties_1.manage_difficulties; } });
var process_embeddings_queue_1 = require("./process_embeddings_queue");
Object.defineProperty(exports, "process_embeddings_queue", { enumerable: true, get: function () { return process_embeddings_queue_1.process_embeddings_queue; } });
var generate_mindmap_1 = require("./generate_mindmap");
Object.defineProperty(exports, "generate_mindmap", { enumerable: true, get: function () { return generate_mindmap_1.generate_mindmap; } });
var generate_focused_summary_1 = require("./generate_focused_summary");
Object.defineProperty(exports, "generate_focused_summary", { enumerable: true, get: function () { return generate_focused_summary_1.generate_focused_summary; } });
var generate_recovery_flashcards_1 = require("./generate_recovery_flashcards");
Object.defineProperty(exports, "generate_recovery_flashcards", { enumerable: true, get: function () { return generate_recovery_flashcards_1.generate_recovery_flashcards; } });
var generate_recovery_quiz_1 = require("./generate_recovery_quiz");
Object.defineProperty(exports, "generate_recovery_quiz", { enumerable: true, get: function () { return generate_recovery_quiz_1.generate_recovery_quiz; } });
var get_token_usage_stats_1 = require("./get_token_usage_stats");
Object.defineProperty(exports, "get_token_usage_stats", { enumerable: true, get: function () { return get_token_usage_stats_1.get_token_usage_stats; } });
// Delete operations
var delete_quiz_session_1 = require("./delete_quiz_session");
Object.defineProperty(exports, "delete_quiz_session", { enumerable: true, get: function () { return delete_quiz_session_1.delete_quiz_session; } });
var delete_flashcard_session_1 = require("./delete_flashcard_session");
Object.defineProperty(exports, "delete_flashcard_session", { enumerable: true, get: function () { return delete_flashcard_session_1.delete_flashcard_session; } });
//# sourceMappingURL=index.js.map