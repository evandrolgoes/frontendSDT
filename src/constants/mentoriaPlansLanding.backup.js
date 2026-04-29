export const MENTORIA_PLANS_IMAGES = {
  heroFarm:
    "https://d6c3507005dbeecfa21c1ba89e6db00d.cdn.bubble.io/f1768478680313x884204212029605000/2.%20NDF.pptx%20%281%29.jpg",
  mentorPortrait:
    "https://d6c3507005dbeecfa21c1ba89e6db00d.cdn.bubble.io/f1768478337656x795680711954410200/mentor.JPG",
  abstractBg:
    "https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?q=80&w=1974&auto=format&fit=crop",
  // Conceito — campo de soja ao entardecer
  conceitoField:
    "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=900&auto=format&fit=crop&q=80",
  // Faixa atmosférica entre personas e mentor — trading floor
  stripTrading:
    "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1600&auto=format&fit=crop&q=80",
  // Delivery cards
  deliveryPlatform: "/plataforma-aulas.png",
  deliveryLive: "/encontros-ao-vivo.png",
  deliveryCommunity: "/comunidade-whatsapp.png",
  deliveryTools: "/ferramentas-hedge.png",
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
    imageKey: "deliveryPlatform",
    title: "Plataforma com Aulas Gravadas",
    description: "Do básico ao avançado, organizadas por módulo. 6 meses de acesso completo.",
  },
  {
    imageKey: "deliveryLive",
    title: "Encontros Mensais ao Vivo",
    description: "1 encontro Ao Vivo 1x por mês com mercado, estratégia e tira-dúvidas ao vivo.",
  },
  {
    imageKey: "deliveryCommunity",
    title: "Comunidade no WhatsApp",
    description: "Grupo exclusivo para troca entre membros, com participação direta do mentor.",
  },
  {
    imageKey: "deliveryTools",
    title: "Ferramentas Exclusivas de Hedge",
    description: "Dashboards profissionais para montar e acompanhar suas operações de hedge.",
  },
];

export const MENTORIA_PLANS = [
  {
    id: "intermediario",
    badge: null,
    accentColor: "#7cf592",
    levelColor: "rgba(220, 227, 225, 0.92)",
    romanNumeral: "I",
    levelWord: "Level",
    levelPrefix: "Nível: Intermediário",
    level: "Trader Junior",
    subtitle: "Inicie a sua Jornada nesse Mercado",
    promise: "Inicie a sua Jornada nesse Mercado",
    forWho: [
            "Quem quer ser o Profissional mais valorizado do Agro dos próximos 10 anos",
      "Quem já conhece sobre Derivativos e agora quer entrar no Agro",
      "Quem busca uma base sólida antes de avançar para o nível Estrategista",
      "Profissionais que querem fazer uma transição de carreira calculada e em até 12 meses",
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
      "1 encontro mensal Ao Vivo",
      "Comunidade no WhatsApp",
      "6 meses de acesso completo",
    ],
    originalPrice: "R$ 5.000",
    priceInstallment: "12x de R$ 197",
    priceTotal: "ou R$ 1.970 à vista",
    ctaLabel: "QUERO SER TRADER AGRO",
    ctaHref: "https://chk.eduzz.com/6W4GZAQ60Z",
  },
  {
    id: "avancado",
    badge: "MAIS COMPLETO",
    accentColor: "#f97316",
    levelColor: "#f97316",
    romanNumeral: "II",
    levelWord: "Level",
    levelPrefix: "Nível: Avançado",
    level: "Estrategista de Hedge",
    subtitle: "Seja o Profissional + Procurado do Agro",
    promise: "Você vai começar a jogar o jogo de verdade.",
    forWho: [
      "Produtores rurais que precisam melhorar a margem financeira decidindo com estratégia e não com achismo",
            "Profissionais do Agro que desejam empreender como Consultores com Liberdade Financeira e de Tempo",

      "Profissionais do Agro que querem aceletar a sua transição de carreira em até 6 meses",
      "Quem quer aprender a montar políticas de hedge, comitê de risco e fazer operações estruturadas",
      "Consultores do Agro que desejam faturar pelo menos R$15 Mil mensais.",
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
      "Logística EUA e Logística Soja Mundo",
            "Rotina comercial e Vendas 2.0",

      
    ],
    includesIntro: "Você terá acesso a:",
    includes: [
      "Ferramentas e Planilhas exclusivas para Estrategistas",
      "Módulos exclusivos de nível avançado",
            "Comunidade Exclusiva de Estrategistas no WhatsApp",
          ],
    originalPrice: "R$ 10.000",
    priceInstallment: "12x de R$ 297",
    priceTotal: "ou R$ 2.970 à vista",
    ctaLabel: "QUERO SER ESTRATEGISTA",
    ctaHref: "https://chk.eduzz.com/39YN7V73WO",
  },
];
