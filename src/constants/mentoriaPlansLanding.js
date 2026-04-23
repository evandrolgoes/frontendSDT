export const MENTORIA_PLANS_IMAGES = {
  heroFarm:
    "https://d6c3507005dbeecfa21c1ba89e6db00d.cdn.bubble.io/f1768478680313x884204212029605000/2.%20NDF.pptx%20%281%29.jpg",
  mentorPortrait:
    "https://d6c3507005dbeecfa21c1ba89e6db00d.cdn.bubble.io/f1768478337656x795680711954410200/mentor.JPG",
  abstractBg:
    "https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?q=80&w=1974&auto=format&fit=crop",
};

export const MENTORIA_PLANS_PERSONAS = [
  {
    role: "Produtores Rurais",
    context:
      "Que já produzem bem mas sabem que a margem se perde na comercialização — e querem um estrategista ao seu lado ou querem ser esse estrategista.",
  },
  {
    role: "Consultores & Agrônomos",
    context:
      "Que entregam suporte técnico de alto nível mas ainda não dominam derivativos e gestão de risco — e querem se tornar a referência financeira dos seus clientes.",
  },
  {
    role: "Profissionais de Tradings",
    context:
      "Que operam o físico e querem dominar a fundo a estruturação de operações com derivativos para criar vantagem real na originação.",
  },
  {
    role: "Investidores do Setor",
    context:
      "Que querem entender os fundamentos reais que movem o preço — e usar esse conhecimento para tomar decisões com inteligência, não com especulação.",
  },
];

export const MENTORIA_PLANS_METRICS = [
  { value: "12+", label: "Anos de Mercado" },
  { value: "+R$500 mm", label: "Gestão de Risco" },
  { value: "R$8 mm +", label: "Ajuste Positivo em Derivativos" },
  { value: "+200 Mil", label: "Contratos Negociados" },
  { value: "+3,5 mm", label: "Sacas de Soja sob Gestão" },
];

export const MENTORIA_PLANS_DELIVERY = [
  {
    icon: "▶",
    title: "Plataforma com Aulas Gravadas",
    description:
      "Acesso a aulas gravadas do básico ao avançado, organizadas por módulo. Você aprende no seu ritmo, com acesso completo durante os 6 meses.",
  },
  {
    icon: "◎",
    title: "Encontros Mensais ao Vivo",
    description:
      "1 encontro por mês com todos os alunos (Trader Agro e Estrategista de Hedge), com duração de aproximadamente 3 horas. Mercado, estratégia e tira-dúvidas ao vivo.",
  },
  {
    icon: "◈",
    title: "Comunidade no WhatsApp",
    description:
      "Grupo exclusivo para dúvidas de mercado. O foco é a troca entre os membros, com participação direta do mentor na medida do possível.",
  },
];

export const MENTORIA_PLANS = [
  {
    id: "intermediario",
    badge: null,
    accentColor: "#f59e0b",
    levelColor: "rgba(220, 227, 225, 0.92)",
    romanNumeral: "I",
    levelWord: "Level",
    levelPrefix: "Nível",
    level: "Trader Agro",
    subtitle: "Base e Execução",
    promise: "Você vai parar de errar na comercialização.",
    forWho: [
      "Quem já fez alguma operação de Derivativos e quer entrar no Agro",
      "Quem quer ser o Profissional mais valorizado do Agro dos próximos 10 anos",
      "Quem busca uma base sólida antes de avançar para o nível Estrategista",
      "Profissionais do Agro que querem fazer uma transição de carreira calculada.",
    ],
    topics: [
      "Por que você será o Profissional + Valorizado do Agro pelos próximos 10 anos",
      "Fundamentos de Hedge aplicado ao Agro. Por que fazer? Como fazer?",
      "Mercado de Bolsa (Chicago) — como funciona e o que move os preços",
      "Câmbio — impacto direto na saca do produtor",
      "Basis — o que é e como usar na decisão de venda",
      "Fatores influenciadores no preço agrícola",
      "Correlações de mercado",
      "Incoterms e logística Brasil",
      "Análise gráfica básica para timing de decisão",
      "Derivativos na prática — NDF e opções (base)",
      "Política de Hedge — estruturação básica",
      "Abordagem comercial e aula de vendas",
    ],
    includesIntro: null,
    includes: [
      "Plataforma com aulas gravadas",
      "1 encontro mensal ao vivo (~3h)",
      "Comunidade no WhatsApp",
      "6 meses de acesso completo",
    ],
    priceInstallment: "12x de R$ 197",
    priceTotal: "ou R$ 1.970 à vista",
    ctaLabel: "QUERO SER TRADER AGRO",
    ctaHref: "#",
  },
  {
    id: "avancado",
    badge: "MAIS COMPLETO",
    accentColor: "#f97316",
    levelColor: "#f97316",
    romanNumeral: "II",
    levelWord: "Level",
    levelPrefix: "Nível",
    level: "Estrategista de Hedge",
    subtitle: "Estratégia e Gestão",
    promise: "Você vai começar a jogar o jogo de verdade.",
    forWho: [
      "Produtores rurais que precisam proteger a margem com método com uso equilibrado de Derivativos",
      "Profissionais do Agro que querem fazer uma transição de carreira em até 6 meses",
      "Profissionais de tradings que precisam dominar derivativos e originação avançada",
      "Quem já é Trader Agro e quer avançar para o nível mais completo",
      "Quem quer aprender a montar políticas de hedge, comitê de risco e fazer operações estruturadas",
    ],
    topics: [
      "Posição de fundos e leitura profissional de mercado",
      "Análise gráfica avançada — timing de decisão de alto nível",
      "Operações estruturadas — ZCC, 3-Way, Call Spread e outras",
      "Hedging Game — simulação de estratégias reais de mercado",
      "Hedge Position — o melhor sistema de gestão de hedge do Brasil",
      "Política de Hedge avançada — construção completa",
      "Comitê de Hedge — como estruturar e conduzir",
            "Análise de crédito, DRE e Balanço: Como os bancos estão te vendo?",
      "Pricing — PMT's e Pricing de derivativos",
      "Logística EUA e Logística Soja Mundo",
            "Rotina comercial e Vendas 2.0",

      
    ],
    includesIntro: "Você terá acesso a:",
    includes: [
      "Ferramentas e Planilhas exclusivas",
      "Módulos exclusivos de nível avançado",
      "1 encontro mensal ao vivo (~3h)",
      "Comunidade no WhatsApp",
      "6 meses de acesso completo",
    ],
    priceInstallment: "12x de R$ 297",
    priceTotal: "ou R$ 2.970 à vista",
    ctaLabel: "QUERO SER ESTRATEGISTA",
    ctaHref: "#",
  },
];
