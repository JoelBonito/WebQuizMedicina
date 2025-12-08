import * as admin from "firebase-admin";

// Initialize Firebase Admin SDK once
if (!admin.apps.length) {
    admin.initializeApp();
}

// Export functions
export { generate_quiz } from "./generate_quiz";

export { generate_flashcards } from "./generate_flashcards";

export { chat } from "./chat";

export { generate_summary } from "./generate_summary";
export { manage_difficulties } from "./manage_difficulties";
export { process_embeddings_queue } from "./process_embeddings_queue";
export { generate_mindmap } from "./generate_mindmap";
export { generate_focused_summary } from "./generate_focused_summary";
export { generate_recovery_flashcards } from "./generate_recovery_flashcards";
export { generate_recovery_quiz } from "./generate_recovery_quiz";
export { get_token_usage_stats } from "./get_token_usage_stats";

// Delete operations
export { delete_quiz_session } from "./delete_quiz_session";
export { delete_flashcard_session } from "./delete_flashcard_session";
