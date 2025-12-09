#!/usr/bin/env python3
"""Script para adicionar traduções de bugReports aos idiomas que estão faltando."""

import json
import os

# Traduções de bugReports para cada idioma
BUGR_TRANSLATIONS = {
    "es": {
        "navbar_bugReports": "Bugs Reportados",
        "bugReports": {
            "title": "Bugs Reportados",
            "subtitle": "Total de {{count}} reportes",
            "detailTitle": "Detalles del Bug",
            "error": "Error al cargar bugs reportados",
            "empty": "No hay bugs reportados aún",
            "filters": {
                "title": "Filtros",
                "status": "Estado",
                "severity": "Gravedad",
                "search": "Buscar",
                "searchPlaceholder": "Buscar por usuario...",
                "all": "Todos"
            },
            "status": {
                "open": "Abierto",
                "in_progress": "En Análisis",
                "resolved": "Resuelto"
            },
            "severity": {
                "low": "Baja",
                "medium": "Media",
                "high": "Alta"
            },
            "card": {
                "reportedBy": "Reportado por",
                "date": "Fecha",
                "page": "Página",
                "project": "Proyecto",
                "description": "Descripción",
                "technicalDetails": "Detalles Técnicos"
            },
            "actions": {
                "viewDetails": "Ver Detalles",
                "markResolved": "Marcar como Resuelto",
                "markInProgress": "En Análisis",
                "resolved": "Bug marcado como resuelto!",
                "inProgressSet": "Estado actualizado a En Análisis",
                "updating": "Actualizando...",
                "error": "Error al actualizar estado"
            },
            "time": {
                "justNow": "Ahora mismo",
                "minutesAgo": "Hace {{count}} minutos",
                "minutesAgo_plural": "Hace {{count}} minutos",
                "hoursAgo": "Hace {{count}} horas",
                "hoursAgo_plural": "Hace {{count}} horas",
                "daysAgo": "Hace {{count}} días",
                "daysAgo_plural": "Hace {{count}} días"
            }
        }
    },
    "fr": {
        "navbar_bugReports": "Bugs Signalés",
        "bugReports": {
            "title": "Bugs Signalés",
            "subtitle": "Total de {{count}} rapports",
            "detailTitle": "Détails du Bug",
            "error": "Erreur lors du chargement des bugs signalés",
            "empty": "Aucun bug signalé pour le moment",
            "filters": {
                "title": "Filtres",
                "status": "Statut",
                "severity": "Gravité",
                "search": "Rechercher",
                "searchPlaceholder": "Rechercher par utilisateur...",
                "all": "Tous"
            },
            "status": {
                "open": "Ouvert",
                "in_progress": "En Analyse",
                "resolved": "Résolu"
            },
            "severity": {
                "low": "Faible",
                "medium": "Moyenne",
                "high": "Haute"
            },
            "card": {
                "reportedBy": "Signalé par",
                "date": "Date",
                "page": "Page",
                "project": "Projet",
                "description": "Description",
                "technicalDetails": "Détails Techniques"
            },
            "actions": {
                "viewDetails": "Voir Détails",
                "markResolved": "Marquer comme Résolu",
                "markInProgress": "En Analyse",
                "resolved": "Bug marqué comme résolu!",
                "inProgressSet": "Statut mis à jour vers En Analyse",
                "updating": "Mise à jour...",
                "error": "Erreur lors de la mise à jour du statut"
            },
            "time": {
                "justNow": "À l'instant",
                "minutesAgo": "Il y a {{count}} minutes",
                "minutesAgo_plural": "Il y a {{count}} minutes",
                "hoursAgo": "Il y a {{count}} heures",
                "hoursAgo_plural": "Il y a {{count}} heures",
                "daysAgo": "Il y a {{count}} jours",
                "daysAgo_plural": "Il y a {{count}} jours"
            }
        }
    }
}

# Fallback para idiomas sem tradução customizada (usa inglês)
EN_BUGREPORTS = {
    "navbar_bugReports": "Reported Bugs",
    "bugReports": {
        "title": "Reported Bugs",
        "subtitle": "Total of {{count}} reports",
        "detailTitle": "Bug Details",
        "error": "Error loading reported bugs",
        "empty": "No bugs reported yet",
        "filters": {
            "title": "Filters",
            "status": "Status",
            "severity": "Severity",
            "search": "Search",
            "searchPlaceholder": "Search by user...",
            "all": "All"
        },
        "status": {
            "open": "Open",
            "in_progress": "In Progress",
            "resolved": "Resolved"
        },
        "severity": {
            "low": "Low",
            "medium": "Medium",
            "high": "High"
        },
        "card": {
            "reportedBy": "Reported by",
            "date": "Date",
            "page": "Page",
            "project": "Project",
            "description": "Description",
            "technicalDetails": "Technical Details"
        },
        "actions": {
            "viewDetails": "View Details",
            "markResolved": "Mark as Resolved",
            "markInProgress": "In Progress",
            "resolved": "Bug marked as resolved!",
            "inProgressSet": "Status updated to In Progress",
            "updating": "Updating...",
            "error": "Error updating status"
        },
        "time": {
            "justNow": "Just now",
            "minutesAgo": "{{count}} minutes ago",
            "minutesAgo_plural": "{{count}} minutes ago",
            "hoursAgo": "{{count}} hours ago",
            "hoursAgo_plural": "{{count}} hours ago",
            "daysAgo": "{{count}} days ago",
            "daysAgo_plural": "{{count}} days ago"
        }
    }
}

def add_bugreports(locale_file, lang_code):
    """Add bugReports translations to a locale file."""
    try:
        with open(locale_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # Pega tradução customizada ou usa inglês
        translation = BUGR_TRANSLATIONS.get(lang_code, EN_BUGREPORTS)
        
        # Adiciona bugReports
        if 'bugReports' not in data:
            data['bugReports'] = translation['bugReports']
            print(f"✅ Added bugReports to {locale_file}")
        
        # Adiciona navbar.bugReports
        if 'navbar' in data and 'bugReports' not in data['navbar']:
            data['navbar']['bugReports'] = translation['navbar_bugReports']
            print(f"✅ Added navbar.bugReports to {locale_file}")
        
        # Write back
        with open(locale_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=4)
        
        return True
    except Exception as e:
        print(f"❌ Error processing {locale_file}: {e}")
        return False

if __name__ == "__main__":
    locales_dir = "src/locales"
    # Idiomas que faltam bugReports (pt e en já têm)
    languages = ['ar', 'de', 'es', 'fr', 'it', 'ja', 'pt-PT', 'ru', 'zh']
    
    print("🌍 Adding bugReports translations...\n")
    
    for lang in languages:
        locale_file = os.path.join(locales_dir, f"{lang}.json")
        if os.path.exists(locale_file):
            add_bugreports(locale_file, lang)
        else:
            print(f"⚠️  File not found: {locale_file}")
    
    print("\n✨ bugReports translation update complete!")
