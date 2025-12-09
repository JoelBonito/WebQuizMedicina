import { useState, useMemo } from 'react';
import { Users, Search, Calendar, Globe, Monitor, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAdminUsers } from '../../hooks/useAdminUsers';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '../ui/table';
import { formatDistanceToNow, type Locale } from 'date-fns';
import { ptBR, enUS, es, fr, de, it, ru, ar, ja, zhCN } from 'date-fns/locale';

const localeMap: Record<string, Locale> = {
    pt: ptBR,
    'pt-PT': ptBR,
    en: enUS,
    es: es,
    fr: fr,
    de: de,
    it: it,
    ru: ru,
    ar: ar,
    ja: ja,
    zh: zhCN,
};

/**
 * Dashboard de Usuários (Admin Only)
 * 
 * Exibe listagem completa de todos os usuários cadastrados com:
 * - Email, data de cadastro, último acesso
 * - Informações de dispositivo (browser, OS, tipo)
 * - Localização aproximada (país, cidade)
 * - Busca por email/nome
 */
export function UsersDashboard() {
    const { t, i18n } = useTranslation();
    const { users, loading, isAdmin } = useAdminUsers();
    const [searchTerm, setSearchTerm] = useState('');

    const locale = localeMap[i18n.language] || enUS;

    // Filtrar usuários baseado na busca
    const filteredUsers = useMemo(() => {
        if (!searchTerm) return users;

        const search = searchTerm.toLowerCase();
        return users.filter((user) =>
            user.display_name?.toLowerCase().includes(search) ||
            user.id.toLowerCase().includes(search)
        );
    }, [users, searchTerm]);

    // Formatação de data
    const formatDate = (timestamp: any) => {
        if (!timestamp) return t('admin.usersDashboard.never');
        try {
            return formatDistanceToNow(timestamp.toDate(), {
                addSuffix: true,
                locale,
            });
        } catch {
            return '-';
        }
    };

    // Ícone de dispositivo
    const getDeviceIcon = (deviceType?: string) => {
        switch (deviceType) {
            case 'Mobile':
                return '📱';
            case 'Tablet':
                return '📲';
            case 'Desktop':
            default:
                return '💻';
        }
    };

    if (!isAdmin) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-6">
                <Card className="max-w-md border-destructive/20 bg-destructive/10">
                    <CardContent className="py-8 text-center">
                        <p className="text-red-600 font-medium">{t('admin.notAuthorized')}</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background">
            <div className="container mx-auto px-6 py-8">
                {/* Header */}
                <div className="mb-8">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-3 rounded-2xl bg-gradient-to-br from-[#0891B2] to-[#7CB342] shadow-lg">
                            <Users className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold text-foreground">{t('admin.usersDashboard.title')}</h1>
                            <p className="text-muted-foreground">{t('admin.usersDashboard.subtitle')}</p>
                        </div>
                    </div>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <Card className="glass-hover border-border">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-medium text-muted-foreground">
                                Total de Usuários
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center gap-3">
                                <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg">
                                    <Users className="w-5 h-5 text-white" />
                                </div>
                                <p className="text-3xl font-bold text-foreground">{users.length}</p>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="glass-hover border-border">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-medium text-muted-foreground">
                                Usuários Ativos (7d)
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center gap-3">
                                <div className="p-3 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 shadow-lg">
                                    <Calendar className="w-5 h-5 text-white" />
                                </div>
                                <p className="text-3xl font-bold text-foreground">
                                    {users.filter((u) => {
                                        if (!u.last_access_at) return false;
                                        const daysDiff = (Date.now() - u.last_access_at.toDate().getTime()) / (1000 * 60 * 60 * 24);
                                        return daysDiff <= 7;
                                    }).length}
                                </p>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="glass-hover border-border">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-medium text-muted-foreground">
                                Mobile / Desktop
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center gap-3">
                                <div className="p-3 rounded-xl bg-gradient-to-br from-[#0891B2] to-[#7CB342] shadow-lg">
                                    <Monitor className="w-5 h-5 text-white" />
                                </div>
                                <p className="text-3xl font-bold text-foreground">
                                    {users.filter((u) => u.device_info?.device_type === 'Mobile').length} / {users.filter((u) => u.device_info?.device_type === 'Desktop').length}
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Users Table */}
                <Card className="glass border-border">
                    <CardHeader>
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                            <div>
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <Users className="w-5 h-5 text-[#0891B2]" />
                                    {t('admin.usersDashboard.title')}
                                    <Badge variant="outline" className="ml-auto text-xs">
                                        {filteredUsers.length} usuários
                                    </Badge>
                                </CardTitle>
                                <CardDescription>
                                    Informações detalhadas de todos os usuários cadastrados
                                </CardDescription>
                            </div>

                            {/* Search */}
                            <div className="relative w-full md:w-64">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <Input
                                    placeholder="Buscar por nome ou email..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-10"
                                />
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="flex justify-center items-center py-12">
                                <Loader2 className="w-8 h-8 animate-spin text-[#0891B2]" />
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>{t('admin.usersDashboard.columns.email')}</TableHead>
                                            <TableHead>{t('admin.usersDashboard.columns.createdAt')}</TableHead>
                                            <TableHead>{t('admin.usersDashboard.columns.lastAccess')}</TableHead>
                                            <TableHead>{t('admin.usersDashboard.columns.projects')}</TableHead>
                                            <TableHead>{t('admin.usersDashboard.columns.browser')}</TableHead>
                                            <TableHead>{t('admin.usersDashboard.columns.os')}</TableHead>
                                            <TableHead>{t('admin.usersDashboard.columns.device')}</TableHead>
                                            <TableHead>{t('admin.usersDashboard.columns.location')}</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredUsers.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                                                    <Search className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                                                    <p>{t('admin.usersDashboard.noUsers')}</p>
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            filteredUsers.map((user) => (
                                                <TableRow key={user.id} className="hover:bg-muted/50">
                                                    <TableCell>
                                                        <div>
                                                            <p className="font-medium text-foreground">
                                                                {user.display_name || 'Sem nome'}
                                                            </p>
                                                            <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                                                                {user.id}
                                                            </p>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-sm text-muted-foreground">
                                                        {formatDate(user.created_at)}
                                                    </TableCell>
                                                    <TableCell className="text-sm text-muted-foreground">
                                                        {formatDate(user.last_access_at)}
                                                    </TableCell>
                                                    <TableCell className="text-sm font-medium">
                                                        <Badge variant="outline" className="bg-[#0891B2]/10 text-[#0891B2] border-[#0891B2]/20">
                                                            {user.projects_count || 0}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-sm">
                                                        {user.device_info?.browser || '-'}
                                                    </TableCell>
                                                    <TableCell className="text-sm">
                                                        {user.device_info?.os || '-'}
                                                    </TableCell>
                                                    <TableCell className="text-sm">
                                                        <span className="mr-1">
                                                            {getDeviceIcon(user.device_info?.device_type)}
                                                        </span>
                                                        {user.device_info?.device_type || '-'}
                                                    </TableCell>
                                                    <TableCell className="text-sm">
                                                        {user.location_info ? (
                                                            <div className="flex items-center gap-1">
                                                                <Globe className="w-3 h-3 text-muted-foreground" />
                                                                <span>
                                                                    {user.location_info.city ?
                                                                        `${user.location_info.city}, ${user.location_info.country}` :
                                                                        user.location_info.country
                                                                    }
                                                                </span>
                                                            </div>
                                                        ) : (
                                                            '-'
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
