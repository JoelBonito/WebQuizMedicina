import { useState, useEffect } from 'react';
import { useProfile } from '../hooks/useProfile';
import { useTokenUsage, formatCostBRL, formatTokens, getOperationLabel } from '../hooks/useTokenUsage';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from './ui/chart';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts';
import {
  Shield,
  DollarSign,
  Users,
  TrendingUp,
  Calendar,
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertCircle,
  Search,
  FolderKanban,
} from 'lucide-react';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';

export function AdminDashboard() {
  const { profile } = useProfile();
  const [startDate, setStartDate] = useState<Date>(
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  );
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [loadingProjects, setLoadingProjects] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');

  const {
    userUsage,
    projectUsage,
    dailyUsage,
    summary,
    loading,
    error,
    fetchAll,
    fetchProjectUsage,
  } = useTokenUsage({
    startDate,
    endDate,
    autoFetch: false,
  });

  // Check if user is admin
  const isAdmin = profile?.role === 'admin';

  // Fetch data on mount and when dates change
  useEffect(() => {
    if (isAdmin) {
      fetchAll(startDate, endDate);
    }
  }, [isAdmin, startDate, endDate]);

  // Fetch project usage when a user is expanded
  const handleUserExpand = async (userId: string) => {
    if (expandedUserId === userId) {
      setExpandedUserId(null);
      return;
    }

    setExpandedUserId(userId);
    setLoadingProjects(true);
    try {
      await fetchProjectUsage(userId, startDate, endDate);
    } finally {
      setLoadingProjects(false);
    }
  };

  // Filter users based on search term
  const filteredUserUsage = userUsage.filter((user) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      user.display_name?.toLowerCase().includes(searchLower) ||
      user.user_email?.toLowerCase().includes(searchLower)
    );
  });

  // Format date for input
  const formatDateForInput = (date: Date) => {
    return date.toISOString().split('T')[0];
  };

  // Handle date change
  const handleDateChange = (type: 'start' | 'end', value: string) => {
    const date = new Date(value);
    if (type === 'start') {
      setStartDate(date);
    } else {
      setEndDate(date);
    }
  };

  // If not admin, show access denied
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white flex items-center justify-center p-6">
        <Alert className="max-w-md border-red-200 bg-red-50">
          <AlertCircle className="h-5 w-5 text-red-600" />
          <AlertDescription className="text-red-800 font-medium">
            Acesso negado. Esta página é restrita a administradores.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white">
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-[#0891B2] to-[#7CB342] shadow-lg">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
              <p className="text-gray-600">Monitoramento de consumo de tokens</p>
            </div>
          </div>
        </div>

        {/* Date Filters */}
        <Card className="mb-6 glass border-gray-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Calendar className="w-5 h-5 text-[#0891B2]" />
              Filtros
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="startDate" className="text-sm font-medium text-gray-700">
                  Data Inicial
                </Label>
                <Input
                  id="startDate"
                  type="date"
                  value={formatDateForInput(startDate)}
                  onChange={(e) => handleDateChange('start', e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="endDate" className="text-sm font-medium text-gray-700">
                  Data Final
                </Label>
                <Input
                  id="endDate"
                  type="date"
                  value={formatDateForInput(endDate)}
                  onChange={(e) => handleDateChange('end', e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Loading State */}
        {loading && (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-[#0891B2]" />
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <Alert className="mb-6 border-red-200 bg-red-50">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <AlertDescription className="text-red-800">
              Erro ao carregar dados: {error.message}
            </AlertDescription>
          </Alert>
        )}

        {/* Summary Cards */}
        {!loading && summary && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {/* Total Tokens */}
            <Card className="glass-hover border-gray-200 transition-all duration-300">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-gray-600">
                  Total de Tokens (Mês Atual)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg">
                    <TrendingUp className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-gray-900">
                      {formatTokens(summary.total_tokens || 0)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {formatTokens(summary.total_operations || 0)} operações
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Total Cost */}
            <Card className="glass-hover border-gray-200 transition-all duration-300">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-gray-600">
                  Custo Total (BRL)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 shadow-lg">
                    <DollarSign className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-gray-900">
                      {formatCostBRL(summary.total_cost_brl || 0)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Operação mais usada: {getOperationLabel(summary.most_used_operation || '')}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Active Users */}
            <Card className="glass-hover border-gray-200 transition-all duration-300">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-gray-600">
                  Usuários Ativos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-gradient-to-br from-[#0891B2] to-[#7CB342] shadow-lg">
                    <Users className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-gray-900">
                      {summary.active_users || 0}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Média: {formatTokens(Math.round(summary.avg_tokens_per_operation || 0))} tokens/op
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Daily Usage Chart */}
        {!loading && dailyUsage.length > 0 && (
          <Card className="mb-8 glass border-gray-200">
            <CardHeader>
              <CardTitle className="text-lg">Consumo Diário (Últimos 30 Dias)</CardTitle>
              <CardDescription>Evolução do uso de tokens ao longo do tempo</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ChartContainer
                  config={{
                    total_tokens: {
                      label: 'Total Tokens',
                      color: 'hsl(var(--chart-1))',
                    },
                    total_cost_brl: {
                      label: 'Custo (BRL)',
                      color: 'hsl(var(--chart-2))',
                    },
                  }}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={dailyUsage}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(value) => {
                          const date = new Date(value);
                          return `${date.getDate()}/${date.getMonth() + 1}`;
                        }}
                        className="text-xs"
                      />
                      <YAxis
                        yAxisId="left"
                        tickFormatter={(value) => formatTokens(value)}
                        className="text-xs"
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        tickFormatter={(value) => `R$ ${value.toFixed(2)}`}
                        className="text-xs"
                      />
                      <ChartTooltip
                        content={({ active, payload }) => {
                          if (!active || !payload || payload.length === 0) return null;
                          const data = payload[0].payload;
                          return (
                            <div className="glass-dark rounded-xl p-3 border border-gray-200 shadow-xl">
                              <p className="text-sm font-semibold text-gray-900 mb-2">
                                {new Date(data.date).toLocaleDateString('pt-BR')}
                              </p>
                              <div className="space-y-1">
                                <p className="text-xs text-gray-700">
                                  <span className="font-medium">Tokens:</span> {formatTokens(data.total_tokens)}
                                </p>
                                <p className="text-xs text-gray-700">
                                  <span className="font-medium">Custo:</span> {formatCostBRL(data.total_cost_brl)}
                                </p>
                                <p className="text-xs text-gray-700">
                                  <span className="font-medium">Usuários:</span> {data.unique_users}
                                </p>
                              </div>
                            </div>
                          );
                        }}
                      />
                      <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="total_tokens"
                        stroke="hsl(var(--chart-1))"
                        strokeWidth={2}
                        dot={{ fill: 'hsl(var(--chart-1))', r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="total_cost_brl"
                        stroke="hsl(var(--chart-2))"
                        strokeWidth={2}
                        dot={{ fill: 'hsl(var(--chart-2))', r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Users Table */}
        {!loading && userUsage.length > 0 && (
          <Card className="glass border-gray-200">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="w-5 h-5 text-[#0891B2]" />
                Consumo por Usuário
                <Badge variant="outline" className="ml-auto text-xs">
                  {userUsage.length} usuários
                </Badge>
              </CardTitle>
              <CardDescription className="flex items-center gap-2 text-sm">
                <span className="inline-flex items-center gap-1">
                  <ChevronRight className="w-3 h-3" />
                  Clique em um usuário para ver breakdown por projeto/matéria
                </span>
              </CardDescription>

              {/* Search Bar */}
              <div className="mt-4 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Buscar por nome ou email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead>Usuário</TableHead>
                    <TableHead className="text-right">Total Tokens</TableHead>
                    <TableHead className="text-right">Custo (BRL)</TableHead>
                    <TableHead className="text-center">Operações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUserUsage.length === 0 && searchTerm && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                        <div className="flex flex-col items-center gap-2">
                          <Search className="w-8 h-8 text-gray-400" />
                          <p>Nenhum usuário encontrado para "{searchTerm}"</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                  {filteredUserUsage.map((user) => (
                    <>
                      <TableRow
                        key={user.user_id}
                        className="cursor-pointer hover:bg-blue-50/50 transition-all duration-200 border-l-4 border-l-transparent hover:border-l-[#0891B2]"
                        onClick={() => handleUserExpand(user.user_id)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {expandedUserId === user.user_id ? (
                              <ChevronDown className="w-4 h-4 text-[#0891B2] font-bold" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-gray-400" />
                            )}
                            {expandedUserId === user.user_id && loadingProjects && (
                              <Loader2 className="w-3 h-3 animate-spin text-[#0891B2]" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium text-gray-900">{user.display_name}</p>
                            <p className="text-xs text-gray-500">{user.user_email}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-semibold text-gray-900">
                          {formatTokens(user.total_tokens)}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-green-700">
                          {formatCostBRL(user.total_cost_brl)}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex flex-wrap gap-1 justify-center">
                            {user.operation_counts &&
                              Object.entries(user.operation_counts as Record<string, number>).map(
                                ([op, count]) => (
                                  <Badge
                                    key={op}
                                    variant="outline"
                                    className="text-xs bg-[#0891B2]/10 text-[#0891B2] border-[#0891B2]/20"
                                  >
                                    {getOperationLabel(op)}: {count}
                                  </Badge>
                                )
                              )}
                          </div>
                        </TableCell>
                      </TableRow>

                      {/* Expanded Project Details */}
                      {expandedUserId === user.user_id && (
                        <TableRow>
                          <TableCell colSpan={5} className="bg-gradient-to-r from-blue-50/30 to-green-50/30 p-0 border-l-4 border-l-[#0891B2]">
                            <div className="p-6">
                              <div className="flex items-center justify-between mb-4">
                                <h4 className="text-base font-bold text-gray-900 flex items-center gap-2">
                                  <FolderKanban className="w-5 h-5 text-[#0891B2]" />
                                  Consumo por Projeto / Matéria
                                </h4>
                                <Badge className="bg-[#0891B2] text-white">
                                  {projectUsage.length} projetos
                                </Badge>
                              </div>

                              {loadingProjects && (
                                <div className="flex justify-center items-center py-8">
                                  <Loader2 className="w-6 h-6 animate-spin text-[#0891B2]" />
                                </div>
                              )}

                              {!loadingProjects && projectUsage.length === 0 && (
                                <div className="text-center py-8 text-gray-500">
                                  <FolderKanban className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                                  <p className="font-medium">Nenhum projeto com consumo registrado</p>
                                  <p className="text-sm">Este usuário ainda não gerou conteúdo em nenhum projeto</p>
                                </div>
                              )}

                              {!loadingProjects && projectUsage.length > 0 && (
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Projeto</TableHead>
                                    <TableHead className="text-right">Tokens</TableHead>
                                    <TableHead className="text-right">Custo</TableHead>
                                    <TableHead className="text-center">Operações</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {projectUsage.map((project) => (
                                    <TableRow key={project.project_id} className="hover:bg-white/60">
                                      <TableCell className="text-sm font-medium text-gray-900">
                                        <div className="flex items-center gap-2">
                                          <FolderKanban className="w-4 h-4 text-gray-400" />
                                          {project.project_name}
                                        </div>
                                      </TableCell>
                                      <TableCell className="text-right text-sm font-semibold text-gray-900">
                                        {formatTokens(project.total_tokens)}
                                        <p className="text-xs text-gray-500 font-normal">
                                          Input: {formatTokens(project.total_input_tokens)} | Output: {formatTokens(project.total_output_tokens)}
                                        </p>
                                      </TableCell>
                                      <TableCell className="text-right text-sm font-semibold text-green-700">
                                        {formatCostBRL(project.total_cost_brl)}
                                      </TableCell>
                                      <TableCell className="text-center">
                                        <div className="flex flex-wrap gap-1 justify-center">
                                          {project.operation_counts &&
                                            Object.entries(
                                              project.operation_counts as Record<string, number>
                                            ).map(([op, count]) => (
                                              <Badge
                                                key={op}
                                                variant="outline"
                                                className="text-xs bg-[#7CB342]/10 text-[#7CB342] border-[#7CB342]/20 font-medium"
                                              >
                                                {getOperationLabel(op)}: {count}
                                              </Badge>
                                            ))}
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* No Data State */}
        {!loading && !error && userUsage.length === 0 && (
          <Card className="glass border-gray-200">
            <CardContent className="py-12">
              <div className="text-center">
                <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 font-medium">
                  Nenhum dado disponível para o período selecionado
                </p>
                <p className="text-sm text-gray-500 mt-2">
                  Tente ajustar os filtros de data ou aguarde o registro de uso de tokens
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
