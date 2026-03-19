
import { Module, Persona } from './types';

export const MODULES: Module[] = [
  { title: "01. Onboarding", description: "Mentalidade, valores e os pilares da nova profissão." },
  { title: "02. Formação do Preço I", description: "Base física, prêmios e a dinâmica real do campo." },
  { title: "03. Formação do Preço II", description: "Bolsa de Chicago, câmbio e correlações." },
  { title: "04. Macroeconomia", description: "Os vetores globais que movem os preços agrícolas." },
  { title: "05. Mercado Futuro", description: "Long & Short, Posição de Fundos, dinâmica do Mercado." },
  { title: "06. Derivativos I", description: "Opções, NDF e estruturas básicas aplicadas ao físico." },
  { title: "07. Derivativos II", description: "Estratégias avançadas para proteção de margem: ZCC, 3-Way, Call Spread, entre outros." },
  { title: "08. Análise Gráfica", description: "O uso técnico do gráfico para o timing de decisão." },
  { title: "09. Política de Hedge", description: "Como estruturar uma Política de Hedge e um comitê de risco profissional." },
  { title: "10. Execução Prática", description: "Operando com a ferramenta SDT Position, a melhor ferramenta de  Hedge do Brasil." },
  { title: "11. Indicadores Financeiros", description: "As métricas que realmente importam no Agro." },
  { title: "12. Transição de Carreira", description: "O caminho para se tornar um estrategista independente e de valor no mercado." },
  { title: "13. Abordagem Comercial", description: "Construção de carteira e venda de valor." },
  { title: "14. Direcionamento Final", description: "Plantão final e os próximos passos no mercado." }
];

export const PERSONAS: Persona[] = [
  {
    role: "Produtores Rurais",
    context: "Que desejam parar de entregar a margem do ano em decisões emocionais e dominar a trava de preços."
  },
  {
    role: "Consultores & Agrônomos",
    context: "Que buscam elevar seu nível de entrega, agregando inteligência financeira real ao suporte técnico de campo."
  },
  {
    role: "Profissionais de Tradings",
    context: "Que operam o físico e precisam entender a fundo a dinâmica dos derivativos para otimizar originação."
  },
  {
    role: "Investidores do Setor",
    context: "Que buscam compreender os fundamentos reais que movem o preço da saca além da especulação de tela."
  }
];

export const IMAGES = {
  hero_farm: "https://d6c3507005dbeecfa21c1ba89e6db00d.cdn.bubble.io/f1768478680313x884204212029605000/2.%20NDF.pptx%20%281%29.jpg",
  analysis_placeholder: "https://d6c3507005dbeecfa21c1ba89e6db00d.cdn.bubble.io/f1768478993354x215542235909228060/Sem%20Ti%CC%81tulo%20131.jpg",
  sdt_position_preview: "https://d6c3507005dbeecfa21c1ba89e6db00d.cdn.bubble.io/f1768527582763x514806205801388500/1.jpg?_gl=1*1rg55if*_gcl_au*NDE5Njc3MzgwLjE3NjcwMzY1OTc.*_ga*ODA0NTQxODMzLjE3NjcwMzY1OTc.*_ga_BFPVR2DEE2*czE3Njg0NzM5ODQkbzEwJGcxJHQxNzY4NTA1MTI5JGo2MCRsMCRoMA..",
  sdt_carousel: [
    "https://d6c3507005dbeecfa21c1ba89e6db00d.cdn.bubble.io/f1768527582763x514806205801388500/1.jpg?_gl=1*1rg55if*_gcl_au*NDE5Njc3MzgwLjE3NjcwMzY1OTc.*_ga*ODA0NTQxODMzLjE3NjcwMzY1OTc.*_ga_BFPVR2DEE2*czE3Njg0NzM5ODQkbzEwJGcxJHQxNzY4NTA1MTI5JGo2MCRsMCRoMA..",
    "https://d6c3507005dbeecfa21c1ba89e6db00d.cdn.bubble.io/f1768527591157x304984797817830400/2.jpg?_gl=1*1rg55if*_gcl_au*NDE5Njc3MzgwLjE3NjcwMzY1OTc.*_ga*ODA0NTQxODMzLjE3NjcwMzY1OTc.*_ga_BFPVR2DEE2*czE3Njg0NzM5ODQkbzEwJGcxJHQxNzY4NTA1MTI5JGo2MCRsMCRoMA..",
    "https://d6c3507005dbeecfa21c1ba89e6db00d.cdn.bubble.io/f1768527599005x485382483897059100/3.jpg?_gl=1*1rg55if*_gcl_au*NDE5Njc3MzgwLjE3NjcwMzY1OTc.*_ga*ODA0NTQxODMzLjE3NjcwMzY1OTc.*_ga_BFPVR2DEE2*czE3Njg0NzM5ODQkbzEwJGcxJHQxNzY4NTA1MTI5JGo2MCRsMCRoMA..",
    "https://d6c3507005dbeecfa21c1ba89e6db00d.cdn.bubble.io/f1768527606044x147461032616644580/4.jpg?_gl=1*1rg55if*_gcl_au*NDE5Njc3MzgwLjE3NjcwMzY1OTc.*_ga*ODA0NTQxODMzLjE3NjcwMzY1OTc.*_ga_BFPVR2DEE2*czE3Njg0NzM5ODQkbzEwJGcxJHQxNzY4NTA1MTI5JGo2MCRsMCRoMA..",
    "https://d6c3507005dbeecfa21c1ba89e6db00d.cdn.bubble.io/f1768527613210x908580389053502100/5.jpg?_gl=1*1rg55if*_gcl_au*NDE5Njc3MzgwLjE3NjcwMzY1OTc.*_ga*ODA0NTQxODMzLjE3NjcwMzY1OTc.*_ga_BFPVR2DEE2*czE3Njg0NzM5ODQkbzEwJGcxJHQxNzY4NTA1MTI5JGo2MCRsMCRoMA.."
  ],
  mentor_portrait: "https://d6c3507005dbeecfa21c1ba89e6db00d.cdn.bubble.io/f1768478337656x795680711954410200/mentor.JPG",
  abstract_bg: "https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?q=80&w=1974&auto=format&fit=crop"
};
