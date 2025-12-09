import { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
    DialogFooter,
} from './ui/dialog';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Label } from './ui/label';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface TutorialStep {
    title: string;
    description: string;
    illustration?: string; // URL da imagem (opcional)
}

interface TutorialModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    tutorialKey: string;
    steps: TutorialStep[];
    onComplete?: () => void; // Callback quando marcar "não mostrar novamente"
}

export function TutorialModal({
    open,
    onOpenChange,
    tutorialKey,
    steps,
    onComplete,
}: TutorialModalProps) {
    const { t } = useTranslation();
    const [currentStep, setCurrentStep] = useState(0);
    const [dontShowAgain, setDontShowAgain] = useState(false);

    const isFirstStep = currentStep === 0;
    const isLastStep = currentStep === steps.length - 1;
    const currentStepData = steps[currentStep];

    const handleNext = () => {
        if (!isLastStep) {
            setCurrentStep((prev) => prev + 1);
        }
    };

    const handlePrevious = () => {
        if (!isFirstStep) {
            setCurrentStep((prev) => prev - 1);
        }
    };

    const handleFinish = () => {
        if (dontShowAgain && onComplete) {
            onComplete();
        }
        handleClose();
    };

    const handleClose = () => {
        setCurrentStep(0);
        setDontShowAgain(false);
        onOpenChange(false);
    };

    const handleSkip = () => {
        handleClose();
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[600px] rounded-3xl">
                {/* Header com botão de fechar */}
                <div className="flex items-center justify-between">
                    <div className="flex-1">
                        <DialogTitle className="text-xl font-semibold text-foreground">
                            {currentStepData?.title || t('tutorial.common.helpButton')}
                        </DialogTitle>
                    </div>
                    <button
                        onClick={handleClose}
                        className="text-gray-400 hover:text-muted-foreground transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <DialogDescription className="sr-only">
                    Tutorial passo {currentStep + 1} de {steps.length}
                </DialogDescription>

                {/* Indicador de progresso */}
                <div className="flex items-center gap-2 mt-2">
                    {steps.map((_, index) => (
                        <div
                            key={index}
                            className={`h-1.5 rounded-full flex-1 transition-all ${index === currentStep
                                ? 'bg-gradient-to-r from-[#0891B2] to-[#7CB342]'
                                : index < currentStep
                                    ? 'bg-primary/50'
                                    : 'bg-muted'
                                }`}
                        />
                    ))}
                </div>

                {/* Conteúdo do passo atual */}
                <div className="py-6 space-y-4">
                    {/* Ilustração (se houver) */}
                    {currentStepData?.illustration && (
                        <div className="w-full h-48 bg-muted rounded-xl flex items-center justify-center overflow-hidden">
                            <img
                                src={currentStepData.illustration}
                                alt={currentStepData.title}
                                className="max-w-full max-h-full object-contain"
                            />
                        </div>
                    )}

                    {/* Descrição */}
                    <p className="text-muted-foreground leading-relaxed">
                        {currentStepData?.description}
                    </p>

                    {/* Contador de passos */}
                    <p className="text-xs text-muted-foreground text-center">
                        {currentStep + 1} de {steps.length}
                    </p>
                </div>

                {/* Checkbox "Não mostrar novamente" (em TODOS os passos) */}
                <div className="flex items-center space-x-2 py-2">
                    <Checkbox
                        id={`${tutorialKey}-dont-show`}
                        checked={dontShowAgain}
                        onCheckedChange={(checked) => setDontShowAgain(checked === true)}
                    />
                    <Label
                        htmlFor={`${tutorialKey}-dont-show`}
                        className="text-sm text-muted-foreground cursor-pointer"
                    >
                        {t('tutorial.common.dontShowAgain')}
                    </Label>
                </div>

                {/* Footer com botões de navegação */}
                <DialogFooter className="flex-row justify-between gap-2 pt-4">
                    {/* Botão Pular (apenas se não for último passo) */}
                    {!isLastStep && (
                        <Button
                            variant="ghost"
                            onClick={handleSkip}
                            className="text-muted-foreground"
                        >
                            {t('tutorial.common.skip')}
                        </Button>
                    )}

                    {/* Espaçador */}
                    <div className="flex-1" />

                    {/* Botão Anterior */}
                    {!isFirstStep && (
                        <Button
                            variant="outline"
                            onClick={handlePrevious}
                            className="rounded-xl"
                        >
                            <ChevronLeft className="w-4 h-4 mr-2" />
                            {t('tutorial.common.previous')}
                        </Button>
                    )}

                    {/* Botão Próximo ou Concluir */}
                    {isLastStep ? (
                        <Button
                            onClick={handleFinish}
                            className="rounded-xl bg-gradient-to-r from-[#0891B2] to-[#7CB342] hover:from-[#0891B2] hover:to-[#7CB342] text-white"
                        >
                            {t('tutorial.common.finish')}
                        </Button>
                    ) : (
                        <Button
                            onClick={handleNext}
                            className="rounded-xl bg-gradient-to-r from-[#0891B2] to-[#7CB342] hover:from-[#0891B2] hover:to-[#7CB342] text-white"
                        >
                            {t('tutorial.common.next')}
                            <ChevronRight className="w-4 h-4 ml-2" />
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
