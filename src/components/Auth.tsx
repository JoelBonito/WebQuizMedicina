import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Checkbox } from "./ui/checkbox";
import { Loader2, Mail, Lock, ArrowRight, Github } from "lucide-react";
import { toast } from "sonner";
import { motion } from "motion/react";
import { Logo } from "./Logo";

export function Auth() {
  const { signIn, signUp, signInWithGoogle } = useAuth();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [activeTab, setActiveTab] = useState("signin");
  const [rememberMe, setRememberMe] = useState(false);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await signIn(email, password);
      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Login realizado com sucesso!");
      }
    } catch (error) {
      toast.error("Erro ao fazer login");
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await signUp(email, password);
      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Conta criada! Verifique seu email.");
      }
    } catch (error) {
      toast.error("Erro ao criar conta");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      const { error } = await signInWithGoogle();
      if (error) {
        toast.error(error.message);
      }
    } catch (error) {
      toast.error("Erro ao fazer login com Google");
    } finally {
      setLoading(false);
    }
  };

  const handleGitHubSignIn = async () => {
    toast.info("Login com GitHub em desenvolvimento!");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#F0F9FF] via-white to-[#F1F8E9] p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <div className="mx-auto mb-6 flex justify-center">
            <Logo className="w-auto h-32" variant="full" />
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">
            Bem-vindo ao QuizMed
          </h1>
          <p className="text-gray-600">
            Potencialize seus estudos de medicina com inteligência artificial
          </p>
        </div>

        <Card className="glass-dark border-gray-200 shadow-2xl">
          <CardHeader>
            <CardTitle>Bem-vindo</CardTitle>
            <CardDescription>
              Entre ou crie sua conta para começar
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="signin">Entrar</TabsTrigger>
                <TabsTrigger value="signup">Cadastrar</TabsTrigger>
              </TabsList>

              <TabsContent value="signin">
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email-signin">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        id="email-signin"
                        type="email"
                        placeholder="seu@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="rounded-xl pl-10"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password-signin">Senha</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        id="password-signin"
                        type="password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        className="rounded-xl pl-10"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="remember"
                        checked={rememberMe}
                        onCheckedChange={(checked) => setRememberMe(checked as boolean)}
                      />
                      <Label htmlFor="remember" className="text-sm cursor-pointer font-normal">
                        Lembrar-me
                      </Label>
                    </div>
                    <a href="#" className="text-sm text-[#0891B2] hover:text-[#2B3E6F] hover:underline">
                      Esqueceu a senha?
                    </a>
                  </div>
                  <Button
                    type="submit"
                    className="w-full rounded-xl bg-gradient-to-r from-[#0891B2] to-[#7CB342] hover:from-[#0891B2] hover:to-[#7CB342] text-white"
                    disabled={loading}
                  >
                    {loading ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Mail className="w-4 h-4 mr-2" />
                    )}
                    Entrar
                    {!loading && <ArrowRight className="w-4 h-4 ml-2" />}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email-signup">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        id="email-signup"
                        type="email"
                        placeholder="seu@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="rounded-xl pl-10"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password-signup">Senha</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        id="password-signup"
                        type="password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                        className="rounded-xl pl-10"
                      />
                    </div>
                  </div>
                  <Button
                    type="submit"
                    className="w-full rounded-xl bg-gradient-to-r from-[#0891B2] to-[#7CB342] hover:from-[#0891B2] hover:to-[#7CB342] text-white"
                    disabled={loading}
                  >
                    {loading ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Mail className="w-4 h-4 mr-2" />
                    )}
                    Criar Conta
                    {!loading && <ArrowRight className="w-4 h-4 ml-2" />}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-gray-500">Ou</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="rounded-xl"
                onClick={handleGoogleSignIn}
                disabled={loading}
              >
                <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Google
              </Button>

              <Button
                variant="outline"
                className="rounded-xl"
                onClick={handleGitHubSignIn}
                disabled={loading}
              >
                <Github className="w-4 h-4 mr-2" />
                GitHub
              </Button>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-gray-600 mt-6">
          Desenvolvido com ❤️ para potencializar seus estudos
        </p>
      </motion.div>
    </div>
  );
}
