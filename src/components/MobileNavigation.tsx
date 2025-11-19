import { FolderOpen, Sparkles, MessageSquare } from "lucide-react";

interface MobileNavigationProps {
  activeTab: 'sources' | 'studio' | 'chat';
  onTabChange: (tab: 'sources' | 'studio' | 'chat') => void;
}

const MOBILE_TABS = [
  {
    id: 'sources' as const,
    label: 'Fontes',
    icon: FolderOpen,
    bgColor: 'bg-green-50',
    iconColor: 'text-green-600',
  },
  {
    id: 'studio' as const,
    label: 'Estúdio',
    icon: Sparkles,
    bgColor: 'bg-purple-50',
    iconColor: 'text-purple-600',
  },
  {
    id: 'chat' as const,
    label: 'Chat',
    icon: MessageSquare,
    bgColor: 'bg-blue-50',
    iconColor: 'text-blue-600',
  },
];

export function MobileNavigation({ activeTab, onTabChange }: MobileNavigationProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 safe-area-bottom">
      <div className="flex justify-around items-center h-20 px-2">
        {MOBILE_TABS.map(tab => {
          const isActive = activeTab === tab.id;
          const TabIcon = tab.icon;

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`
                flex flex-col items-center justify-center
                flex-1 h-14 gap-1
                transition-all duration-200
                ${isActive ? `${tab.bgColor} scale-105` : 'hover:bg-gray-50'}
                rounded-2xl mx-1
              `}
            >
              <TabIcon className={`
                w-6 h-6
                ${isActive ? tab.iconColor : 'text-gray-400'}
                transition-colors
              `} />
              <span className={`
                text-xs font-medium
                ${isActive ? tab.iconColor : 'text-gray-500'}
                transition-colors
              `}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
