#!/usr/bin/env python3
"""
Script para adicionar a chave 'projects' nas traduções dos demais idiomas
"""
import json
import os

LOCALES_DIR = "/Users/macbookdejoel/Documents/PROJETOS/WebQuizMedicina/WebQuizMedicina/src/locales"

# Traduções para cada idioma
TRANSLATIONS = {
    "es": {
        "admin": {
            "usersDashboard": {
                "columns": {
                    "projects": "Proyectos"
                }
            }
        }
    },
    "fr": {
        "admin": {
            "usersDashboard": {
                "columns": {
                    "projects": "Projets"
                }
            }
        }
    },
    "de": {
        "admin": {
            "usersDashboard": {
                "columns": {
                    "projects": "Projekte"
                }
            }
        }
    },
    "it": {
        "admin": {
            "usersDashboard": {
                "columns": {
                    "projects": "Progetti"
                }
            }
        }
    },
    "pt-PT": {
        "admin": {
            "usersDashboard": {
                "columns": {
                    "projects": "Projetos"
                }
            }
        }
    },
    "ru": {
        "admin": {
            "usersDashboard": {
                "columns": {
                    "projects": "Проекты"
                }
            }
        }
    },
    "ar": {
        "admin": {
            "usersDashboard": {
                "columns": {
                    "projects": "المشاريع"
                }
            }
        }
    },
    "ja": {
        "admin": {
            "usersDashboard": {
                "columns": {
                    "projects": "プロジェクト"
                }
            }
        }
    },
    "zh": {
        "admin": {
            "usersDashboard": {
                "columns": {
                    "projects": "项目"
                }
            }
        }
    }
}

def deep_update(dest, src):
    """Merge nested dict recursively"""
    for key, value in src.items():
        if isinstance(value, dict) and key in dest and isinstance(dest[key], dict):
            deep_update(dest[key], value)
        else:
            dest[key] = value

def sync_locale(locale_code):
    """Sync translations for a specific locale"""
    file_path = os.path.join(LOCALES_DIR, f"{locale_code}.json")
    
    if not os.path.exists(file_path):
        print(f"⚠️  File {file_path} not found, skipping...")
        return
    
    # Read existing file
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # Merge translations
    if locale_code in TRANSLATIONS:
        deep_update(data, TRANSLATIONS[locale_code])
        
        # Write back
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=4)
        
        print(f"✅ Synchronized {locale_code}.json")
    else:
        print(f"⚠️  No translations for {locale_code}")

if __name__ == "__main__":
    print("🌐 Adicionando chave 'projects' em todos os idiomas...")
    
    locales = ["es", "fr", "de", "it", "pt-PT", "ru", "ar", "ja", "zh"]
    
    for locale in locales:
        sync_locale(locale)
    
    print("\n✅ Sincronização completa!")
