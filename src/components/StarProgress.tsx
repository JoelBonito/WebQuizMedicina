import { Star, Trophy } from "lucide-react";
import { motion } from "motion/react";

interface StarProgressProps {
    consecutiveCorrect: number; // 0, 1, 2, ou 3
    showBadge?: boolean; // Se atingiu 3 acertos
}

export function StarProgress({ consecutiveCorrect, showBadge }: StarProgressProps) {
    // Badge inline ao atingir 3 acertos
    if (showBadge) {
        return (
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-gradient-to-r from-green-100 to-emerald-100 border-2 border-green-500 rounded-lg p-3 mt-2"
            >
                <div className="flex items-center gap-3">
                    <motion.div
                        animate={{
                            rotate: [0, -10, 10, -10, 0],
                            scale: [1, 1.1, 1]
                        }}
                        transition={{
                            duration: 2,
                            repeat: Infinity,
                            repeatDelay: 3
                        }}
                    >
                        <Trophy className="w-6 h-6 text-green-600" />
                    </motion.div>

                    <div className="flex-1">
                        <p className="font-semibold text-green-900">Tema Dominado!</p>
                        <p className="text-sm text-green-700">3 acertos consecutivos</p>
                    </div>

                    <div className="flex gap-1">
                        {[1, 2, 3].map(i => (
                            <motion.div
                                key={i}
                                initial={{ scale: 0, rotate: -180 }}
                                animate={{ scale: 1, rotate: 0 }}
                                transition={{
                                    delay: i * 0.1,
                                    type: "spring",
                                    stiffness: 200
                                }}
                            >
                                <Star className="w-5 h-5 fill-yellow-400 text-yellow-400" />
                            </motion.div>
                        ))}
                    </div>
                </div>
            </motion.div>
        );
    }

    // Estrelas de progresso normais
    return (
        <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-gray-500">Progresso:</span>
            <div className="flex gap-1">
                {[1, 2, 3].map(i => {
                    const isFilled = i <= consecutiveCorrect;
                    const isNext = i === consecutiveCorrect + 1;

                    return (
                        <motion.div
                            key={i}
                            animate={isNext ? {
                                scale: [1, 1.2, 1],
                                opacity: [0.5, 1, 0.5]
                            } : {}}
                            transition={isNext ? {
                                duration: 1.5,
                                repeat: Infinity,
                                ease: "easeInOut"
                            } : {}}
                        >
                            <Star
                                className={`w-5 h-5 transition-all ${isFilled
                                    ? 'fill-yellow-400 text-yellow-400 scale-110'
                                    : 'text-gray-300'
                                    }`}
                            />
                        </motion.div>
                    );
                })}
            </div>
            <span className="text-xs font-medium text-muted-foreground">
                {consecutiveCorrect}/3
            </span>
        </div>
    );
}
