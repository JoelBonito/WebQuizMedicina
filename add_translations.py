#!/usr/bin/env python3
"""
Script para adicionar traduções de tutorial e help aos arquivos de idioma.
As traduções são baseadas no inglês (en.json) como fallback.
"""

import json
import os

# Traduções para cada idioma
TRANSLATIONS = {
    "es": {
        "tutorial": {
            "common": {
                "next": "Siguiente",
                "previous": "Anterior",
                "skip": "Saltar",
                "finish": "Finalizar",
                "dontShowAgain": "No mostrar de nuevo",
                "helpButton": "Ayuda"
            },
            "dashboard": {
                "title": "¡Bienvenido a QuizMed!",
                "step1": {
                    "title": "Comienza Actualizando tu Perfil",
                    "description": "Haz clic en tu avatar y ve a 'Perfil'. Personaliza tu nombre, foto, elige el idioma de respuesta de la IA y configura tus preferencias de estudio."
                },
                "step2": {
                    "title": "Crea tus Materias",
                    "description": "Haz clic en 'Nueva Materia' para crear una materia de estudio. Organiza tus estudios por disciplina o tema."
                },
                "step3": {
                    "title": "Organiza tus Estudios",
                    "description": "Cada materia puede contener fuentes (PDFs, documentos), cuestionarios, tarjetas y resúmenes generados por IA."
                },
                "step4": {
                    "title": "🎯 Sistema de Análisis de Dificultades",
                    "description": "La app rastrea automáticamente tus errores en cuestionarios y tarjetas. Luego, puedes generar contenido ENFOCADO solo en los temas más difíciles: Cuestionarios de Recuperación, Tarjetas de Recuperación y Resúmenes Enfocados!"
                },
                "step5": {
                    "title": "¿Necesitas Ayuda?",
                    "description": "Usa el botón SOS (⚠️) en la parte superior para reportar bugs o problemas. ¡Estamos en versión beta y tu feedback es valioso!"
                }
            },
            "profile": {
                "title": "Configuración de Perfil",
                "step1": {
                    "title": "Idioma de Respuesta",
                    "description": "Elige el idioma para todo el contenido generado por IA (cuestionarios, tarjetas, resúmenes, chat)."
                },
                "step2": {
                    "title": "Tema Claro/Oscuro",
                    "description": "Personaliza la apariencia de la app. Elige tema claro, oscuro o sincroniza con la configuración del sistema."
                },
                "step3": {
                    "title": "Auto-eliminación de Dificultades",
                    "description": "Activa para eliminar automáticamente temas de tus dificultades después de 3 respuestas correctas consecutivas."
                }
            },
            "project": {
                "title": "Navegación de Materia",
                "step1": {
                    "title": "Pestaña Fuentes",
                    "description": "Sube PDFs, documentos Word/PowerPoint, imágenes y textos. La IA procesará automáticamente todo el contenido."
                },
                "step2": {
                    "title": "Pestaña Estudio",
                    "description": "Genera cuestionarios adaptativos, tarjetas inteligentes, resúmenes y mapas mentales basados en tus fuentes."
                },
                "step3": {
                    "title": "Pestaña Chat",
                    "description": "Chatea con la IA sobre tus fuentes. Haz preguntas, solicita explicaciones o resúmenes personalizados."
                },
                "step4": {
                    "title": "🎯 Análisis de Dificultades - ¡El Diferenciador!",
                    "description": "El sistema rastrea automáticamente tus errores y dificultades en cuestionarios/tarjetas. Luego, puedes generar contenido ENFOCADO solo en los temas que más necesitas dominar: Cuestionarios de Recuperación, Tarjetas de Recuperación y Resúmenes Enfocados. ¡Estudia inteligentemente!"
                },
                "step5": {
                    "title": "¿Encontraste un Problema?",
                    "description": "Usa el botón SOS (⚠️) para reportar bugs rápidamente. ¡Tu feedback nos ayuda a mejorar!"
                }
            }
        },
        "help": {
            "button": {
                "tooltip": "Reportar Problema (SOS)",
                "title": "Reportar Problema",
                "description": "¿Encontraste un bug o algo que no funciona? ¡Repórtalo aquí!"
            },
            "form": {
                "descriptionLabel": "Describe el problema",
                "descriptionPlaceholder": "¿Qué sucedió? ¿Dónde estabas? ¿Cómo podemos reproducirlo?",
                "severityLabel": "Gravedad",
                "severityLow": "Baja",
                "severityMedium": "Media",
                "severityHigh": "Alta",
                "submit": "Enviar Reporte",
                "submitting": "Enviando...",
                "success": "¡Gracias! Reporte enviado con éxito.",
                "error": "Error al enviar. Intenta de nuevo.",
                "cancel": "Cancelar"
            },
            "beta": {
                "badge": "BETA",
                "message": "Versión Beta - ¡Tu feedback es esencial!"
            }
        }
    },
    "fr": {
        "tutorial": {
            "common": {
                "next": "Suivant",
                "previous": "Précédent",
                "skip": "Passer",
                "finish": "Terminer",
                "dontShowAgain": "Ne plus afficher",
                "helpButton": "Aide"
            },
            "dashboard": {
                "title": "Bienvenue sur QuizMed!",
                "step1": {
                    "title": "Commencez par Mettre à Jour votre Profil",
                    "description": "Cliquez sur votre avatar et allez dans 'Profil'. Personnalisez votre nom, photo, choisissez la langue de réponse de l'IA et configurez vos préférences d'étude."
                },
                "step2": {
                    "title": "Créez vos Matières",
                    "description": "Cliquez sur 'Nouvelle Matière' pour créer une matière d'étude. Organisez vos études par discipline ou thème."
                },
                "step3": {
                    "title": "Organisez vos Études",
                    "description": "Chaque matière peut contenir des sources (PDFs, documents), quiz, cartes et résumés générés par IA."
                },
                "step4": {
                    "title": "🎯 Système d'Analyse des Difficultés",
                    "description": "L'application suit automatiquement vos erreurs dans les quiz et cartes. Ensuite, vous pouvez générer du contenu FOCALISÉ uniquement sur les sujets les plus difficiles: Quiz de Récupération, Cartes de Récupération et Résumés Focalisés!"
                },
                "step5": {
                    "title": "Besoin d'Aide?",
                    "description": "Utilisez le bouton SOS (⚠️) en haut pour signaler des bugs ou problèmes. Nous sommes en version bêta et vos retours sont précieux!"
                }
            },
            "profile": {
                "title": "Paramètres du Profil",
                "step1": {
                    "title": "Langue de Réponse",
                    "description": "Choisissez la langue pour tout le contenu généré par l'IA (quiz, cartes, résumés, chat)."
                },
                "step2": {
                    "title": "Thème Clair/Sombre",
                    "description": "Personnalisez l'apparence de l'application. Choisissez le thème clair, sombre ou synchronisez avec les paramètres système."
                },
                "step3": {
                    "title": "Suppression Automatique des Difficultés",
                    "description": "Activez pour supprimer automatiquement les sujets de vos difficultés après 3 réponses correctes consécutives."
                }
            },
            "project": {
                "title": "Navigation de la Matière",
                "step1": {
                    "title": "Onglet Sources",
                    "description": "Téléchargez des PDFs, documents Word/PowerPoint, images et textes. L'IA traitera automatiquement tout le contenu."
                },
                "step2": {
                    "title": "Onglet Étude",
                    "description": "Générez des quiz adaptatifs, cartes intelligentes, résumés et cartes mentales basés sur vos sources."
                },
                "step3": {
                    "title": "Onglet Chat",
                    "description": "Chattez avec l'IA sur vos sources. Posez des questions, demandez des explications ou résumés personnalisés."
                },
                "step4": {
                    "title": "🎯 Analyse des Difficultés - Le Différenciateur!",
                    "description": "Le système suit automatiquement vos erreurs et difficultés dans les quiz/cartes. Ensuite, vous pouvez générer du contenu FOCALISÉ uniquement sur les sujets que vous devez maîtriser le plus: Quiz de Récupération, Cartes de Récupération et Résumés Focalisés. Étudiez intelligemment!"
                },
                "step5": {
                    "title": "Problème Rencontré?",
                    "description": "Utilisez le bouton SOS (⚠️) pour signaler rapidement des bugs. Vos retours nous aident à nous améliorer!"
                }
            }
        },
        "help": {
            "button": {
                "tooltip": "Signaler un Problème (SOS)",
                "title": "Signaler un Problème",
                "description": "Trouvé un bug ou quelque chose ne fonctionne pas? Signalez-le ici!"
            },
            "form": {
                "descriptionLabel": "Décrivez le problème",
                "descriptionPlaceholder": "Que s'est-il passé? Où étiez-vous? Comment peut-on le reproduire?",
                "severityLabel": "Gravité",
                "severityLow": "Faible",
                "severityMedium": "Moyenne",
                "severityHigh": "Haute",
                "submit": "Envoyer le Rapport",
                "submitting": "Envoi...",
                "success": "Merci! Rapport envoyé avec succès.",
                "error": "Erreur d'envoi. Réessayez.",
                "cancel": "Annuler"
            },
            "beta": {
                "badge": "BETA",
                "message": "Version Bêta - Vos retours sont essentiels!"
            }
        }
    }
}

def add_translations(locale_file, lang_code):
    """Add tutorial and help translations to a locale file."""
    try:
        with open(locale_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # Add translations
        if lang_code in TRANSLATIONS:
            data['tutorial'] = TRANSLATIONS[lang_code]['tutorial']
            data['help'] = TRANSLATIONS[lang_code]['help']
        else:
            # Use English as fallback
            print(f"⚠️  No custom translation for {lang_code}, using English")
            with open('src/locales/en.json', 'r', encoding='utf-8') as f:
                en_data = json.load(f)
            data['tutorial'] = en_data['tutorial']
            data['help'] = en_data['help']
        
        # Write back
        with open(locale_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=4)
        
        print(f"✅ Added translations to {locale_file}")
        return True
    except Exception as e:
        print(f"❌ Error processing {locale_file}: {e}")
        return False

if __name__ == "__main__":
    locales_dir = "src/locales"
    languages = ['de', 'it', 'ja', 'zh', 'ru', 'ar', 'pt-PT', 'es', 'fr']
    
    print("🌍 Adding tutorial and help translations...\n")
    
    for lang in languages:
        locale_file = os.path.join(locales_dir, f"{lang}.json")
        if os.path.exists(locale_file):
            add_translations(locale_file, lang)
        else:
            print(f"⚠️  File not found: {locale_file}")
    
    print("\n✨ Translation update complete!")
