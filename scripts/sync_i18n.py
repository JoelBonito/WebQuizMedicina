#!/usr/bin/env python3
"""
Script para sincronizar chaves i18n nas traduções do Dashboard de Usuários e Notificações Admin
"""
import json
import os

LOCALES_DIR = "/Users/macbookdejoel/Documents/PROJETOS/WebQuizMedicina/WebQuizMedicina/src/locales"

# Traduções para cada idioma
TRANSLATIONS = {
    "es": {
        "navbar": {
            "usersDashboard": "Panel de Usuarios"
        },
        "admin": {
            "usersDashboard": {
                "title": "Panel de Usuarios",
                "subtitle": "Gestione y visualice todos los usuarios de la plataforma",
                "columns": {
                    "email": "Correo electrónico",
                    "createdAt": "Fecha de Registro",
                    "lastAccess": "Último Acceso",
                    "projects": "Proyectos",
                    "browser": "Navegador",
                    "os": "Sistema",
                    "device": "Dispositivo",
                    "location": "Ubicación"
                },
                "noUsers": "No se encontraron usuarios",
                "never": "Nunca accedió"
            }
        },
        "notifications": {
            "title": "Notificaciones",
            "markAllRead": "Marcar todas como leídas",
            "viewAll": "Ver todas",
            "empty": "Sin notificaciones",
            "newUser": "Nuevo usuario",
            "newBug": "Nuevo error reportado"
        }
    },
    "fr": {
        "navbar": {
            "usersDashboard": "Tableau de Bord Utilisateurs"
        },
        "admin": {
            "usersDashboard": {
                "title": "Tableau de Bord Utilisateurs",
                "subtitle": "Gérez et visualisez tous les utilisateurs de la plateforme",
                "columns": {
                    "email": "E-mail",
                    "createdAt": "Date d'inscription",
                    "lastAccess": "Dernier Accès",
                    "projects": "Projets",
                    "browser": "Navigateur",
                    "os": "Système",
                    "device": "Appareil",
                    "location": "Emplacement"
                },
                "noUsers": "Aucun utilisateur trouvé",
                "never": "Jamais accédé"
            }
        },
        "notifications": {
            "title": "Notifications",
            "markAllRead": "Marquer toutes comme lues",
            "viewAll": "Voir tout",
            "empty": "Aucune notification",
            "newUser": "Nouvel utilisateur",
            "newBug": "Nouveau bug signalé"
        }
    },
    "de": {
        "navbar": {
            "usersDashboard": "Benutzer-Dashboard"
        },
        "admin": {
            "usersDashboard": {
                "title": "Benutzer-Dashboard",
                "subtitle": "Verwalten und visualisieren Sie alle Plattformbenutzer",
                "columns": {
                    "email": "E-Mail",
                    "createdAt": "Registrierungsdatum",
                    "lastAccess": "Letzter Zugriff",
                    "projects": "Projekte",
                    "browser": "Browser",
                    "os": "System",
                    "device": "Gerät",
                    "location": "Standort"
                },
                "noUsers": "Keine Benutzer gefunden",
                "never": "Nie zugegriffen"
            }
        },
        "notifications": {
            "title": "Benachrichtigungen",
            "markAllRead": "Alle als gelesen markieren",
            "viewAll": "Alle anzeigen",
            "empty": "Keine Benachrichtigungen",
            "newUser": "Neuer Benutzer",
            "newBug": "Neuer Fehler gemeldet"
        }
    },
    "it": {
        "navbar": {
            "usersDashboard": "Dashboard Utenti"
        },
        "admin": {
            "usersDashboard": {
                "title": "Dashboard Utenti",
                "subtitle": "Gestisci e visualizza tutti gli utenti della piattaforma",
                "columns": {
                    "email": "Email",
                    "createdAt": "Data di Registrazione",
                    "lastAccess": "Ultimo Accesso",
                    "projects": "Progetti",
                    "browser": "Browser",
                    "os": "Sistema",
                    "device": "Dispositivo",
                    "location": "Posizione"
                },
                "noUsers": "Nessun utente trovato",
                "never": "Mai effettuato l'accesso"
            }
        },
        "notifications": {
            "title": "Notifiche",
            "markAllRead": "Segna tutte come lette",
            "viewAll": "Vedi tutto",
            "empty": "Nessuna notifica",
            "newUser": "Nuovo utente",
            "newBug": "Nuovo bug segnalato"
        }
    },
    "pt-PT": {
        "navbar": {
            "usersDashboard": "Painel de Utilizadores"
        },
        "admin": {
            "usersDashboard": {
                "title": "Painel de Utilizadores",
                "subtitle": "Gerir e visualizar todos os utilizadores da plataforma",
                "columns": {
                    "email": "Email",
                    "createdAt": "Data de Registo",
                    "lastAccess": "Último Acesso",
                    "projects": "Projetos",
                    "browser": "Navegador",
                    "os": "Sistema",
                    "device": "Dispositivo",
                    "location": "Localização"
                },
                "noUsers": "Nenhum utilizador encontrado",
                "never": "Nunca acedeu"
            }
        },
        "notifications": {
            "title": "Notificações",
            "markAllRead": "Marcar todas como lidas",
            "viewAll": "Ver todas",
            "empty": "Sem notificações",
            "newUser": "Novo utilizador",
            "newBug": "Novo erro reportado"
        }
    },
    "ru": {
        "navbar": {
            "usersDashboard": "Панель пользователей"
        },
        "admin": {
            "usersDashboard": {
                "title": "Панель пользователей",
                "subtitle": "Управляйте и просматривайте всех пользователей платформы",
                "columns": {
                    "email": "Электронная почта",
                    "createdAt": "Дата регистрации",
                    "lastAccess": "Последний доступ",
                    "projects": "Проекты",
                    "browser": "Браузер",
                    "os": "Система",
                    "device": "Устройство",
                    "location": "Местоположение"
                },
                "noUsers": "Пользователи не найдены",
                "never": "Никогда не заходил"
            }
        },
        "notifications": {
            "title": "Уведомления",
            "markAllRead": "Отметить все как прочитанные",
            "viewAll": "Посмотреть все",
            "empty": "Нет уведомлений",
            "newUser": "Новый пользователь",
            "newBug": "Новая ошибка сообщена"
        }
    },
    "ar": {
        "navbar": {
            "usersDashboard": "لوحة المستخدمين"
        },
        "admin": {
            "usersDashboard": {
                "title": "لوحة المستخدمين",
                "subtitle": "إدارة وعرض جميع مستخدمي المنصة",
                "columns": {
                    "email": "البريد الإلكتروني",
                    "createdAt": "تاريخ التسجيل",
                    "lastAccess": "آخر دخول",
                    "projects": "المشاريع",
                    "browser": "المتصفح",
                    "os": "النظام",
                    "device": "الجهاز",
                    "location": "الموقع"
                },
                "noUsers": "لم يتم العثور على مستخدمين",
                "never": "لم يدخل أبداً"
            }
        },
        "notifications": {
            "title": "الإشعارات",
            "markAllRead": "وضع علامة مقروء على الكل",
            "viewAll": "عرض الكل",
            "empty": "لا توجد إشعارات",
            "newUser": "مستخدم جديد",
            "newBug": "خطأ جديد تم الإبلاغ عنه"
        }
    },
    "ja": {
        "navbar": {
            "usersDashboard": "ユーザーダッシュボード"
        },
        "admin": {
            "usersDashboard": {
                "title": "ユーザーダッシュボード",
                "subtitle": "すべてのプラットフォームユーザーを管理および表示",
                "columns": {
                    "email": "メールアドレス",
                    "createdAt": "登録日",
                    "lastAccess": "最終アクセス",
                    "projects": "プロジェクト",
                    "browser": "ブラウザ",
                    "os": "システム",
                    "device": "デバイス",
                    "location": "位置"
                },
                "noUsers": "ユーザーが見つかりません",
                "never": "アクセスしたことがありません"
            }
        },
        "notifications": {
            "title": "通知",
            "markAllRead": "すべて既読にする",
            "viewAll": "すべて表示",
            "empty": "通知なし",
            "newUser": "新しいユーザー",
            "newBug": "新しいバグが報告されました"
        }
    },
    "zh": {
        "navbar": {
            "usersDashboard": "用户仪表板"
        },
        "admin": {
            "usersDashboard": {
                "title": "用户仪表板",
                "subtitle": "管理和查看所有平台用户",
                "columns": {
                    "email": "电子邮件",
                    "createdAt": "注册日期",
                    "lastAccess": "最后访问",
                    "projects": "项目",
                    "browser": "浏览器",
                    "os": "系统",
                    "device": "设备",
                    "location": "位置"
                },
                "noUsers": "未找到用户",
                "never": "从未访问过"
            }
        },
        "notifications": {
            "title": "通知",
            "markAllRead": "全部标记为已读",
            "viewAll": "查看全部",
            "empty": "没有通知",
            "newUser": "新用户",
            "newBug": "报告了新错误"
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
    print("🌐 Sincronizando chaves i18n...")
    
    locales = ["es", "fr", "de", "it", "pt-PT", "ru", "ar", "ja", "zh"]
    
    for locale in locales:
        sync_locale(locale)
    
    print("\n✅ Sincronização completa!")
