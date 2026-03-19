
import React, { useEffect, useState } from 'react';
import { Section } from './components/Section';
import { MODULES, IMAGES, PERSONAS } from './constants';

const App: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [currentSdtSlide, setCurrentSdtSlide] = useState(0);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('active');
          }
        });
      },
      { threshold: 0.1 }
    );

    const elements = document.querySelectorAll('.reveal');
    elements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  // Timer para o carrossel do SDT Position
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentSdtSlide((prev) => (prev + 1) % IMAGES.sdt_carousel.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const openModal = () => setIsModalOpen(true);
  const closeModal = () => {
    setIsModalOpen(false);
    setTimeout(() => setIsSubmitted(false), 300);
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());

    const response = await fetch('https://formspree.io/f/mnjjnbjk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    if (response.ok) setIsSubmitted(true);
  };

  const labelClasses = "text-[18px] md:text-[20px] font-bebas tracking-[0.4em] text-brand-green uppercase mb-8 block";
  const inputLabelClasses = "text-[10px] uppercase tracking-[0.2em] text-brand-gray/50 mb-2 block font-bold";
  const inputClasses = "w-full bg-black/40 border border-white/5 p-4 text-sm focus:border-brand-green outline-none transition-all font-light text-white appearance-none";

  return (
    <div className="min-h-screen bg-brand-deep text-white selection:bg-brand-green selection:text-white font-light overflow-x-hidden">
      
      {/* Modal de Aplicação */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-fadeIn">
          <div className="absolute inset-0 bg-black/95 backdrop-blur-md" onClick={closeModal}></div>
          <div className="relative w-full max-w-xl bg-brand-dark border border-white/10 p-8 md:p-12 rounded-sm shadow-2xl animate-slide-up max-h-[90vh] overflow-y-auto">
            <button 
              onClick={closeModal}
              className="absolute top-6 right-6 text-brand-gray hover:text-white transition-colors z-10"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>

            {!isSubmitted ? (
              <>
                <div className="mb-10">
                  <span className={labelClasses}>Processo Seletivo</span>
                  <h3 className="text-3xl font-normal tracking-tighter text-white">Solicite acesso à mesa.</h3>
                  <p className="text-brand-gray text-sm mt-4 font-light italic">Seus dados serão submetidos à análise estratégica.</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <label className={inputLabelClasses}>Nome Completo</label>
                    <input required name="nome" type="text" className={inputClasses} />
                  </div>
                  
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <label className={inputLabelClasses}>WhatsApp</label>
                      <input required name="whatsapp" type="tel" className={inputClasses} placeholder="(00) 00000-0000" />
                    </div>
                    <div>
                      <label className={inputLabelClasses}>E-mail</label>
                      <input required name="email" type="email" className={inputClasses} />
                    </div>
                  </div>

                  <div>
                    <label className={inputLabelClasses}>Perfil</label>
                    <select required name="perfil" className={inputClasses}>
                      <option value="" disabled selected>Selecione seu perfil</option>
                      <option value="Produtor Rural">Produtor Rural</option>
                      <option value="Consultor / Agrônomo">Consultor / Agrônomo</option>
                      <option value="Profissional de Trading">Profissional de Trading / Originação</option>
                      <option value="Investidor">Investidor do Setor</option>
                      <option value="Outro">Outro</option>
                    </select>
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <label className={inputLabelClasses}>Trabalho e Função atual</label>
                      <input required name="funcao" type="text" className={inputClasses} />
                    </div>
                    <div>
                      <label className={inputLabelClasses}>Empresa atual</label>
                      <input required name="empresa" type="text" className={inputClasses} />
                    </div>
                  </div>

                  <div>
                    <label className={inputLabelClasses}>Qual o objetivo com a mentoria?</label>
                    <select required name="objetivo_mentoria" className={inputClasses}>
                      <option value="" disabled selected>Selecione seu objetivo principal</option>
                      <option value="Dominar proteção de margem (Hedge)">Dominar proteção de margem (Hedge)</option>
                      <option value="Transição de carreira para o mercado financeiro Agro">Transição de carreira para o mercado financeiro Agro</option>
                      <option value="Oferecer consultoria estratégica para clientes">Oferecer consultoria estratégica para clientes</option>
                      <option value="Entender formação de preços (Chicago/Câmbio)">Entender formação de preços (Chicago/Câmbio)</option>
                    </select>
                  </div>

                  <button type="submit" className="w-full bg-brand-green text-white py-5 text-[11px] font-black uppercase tracking-[0.4em] hover:brightness-110 transition-all green-glow">
                    ENVIAR APLICAÇÃO
                  </button>
                </form>
              </>
            ) : (
              <div className="py-20 text-center animate-fadeIn">
                <div className="w-16 h-16 border border-brand-green rounded-full flex items-center justify-center mx-auto mb-8">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#008000" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg>
                </div>
                <h3 className="text-2xl font-normal mb-4">Aplicação em análise.</h3>
                <p className="text-brand-gray text-sm leading-relaxed max-w-xs mx-auto">Em breve, nossa equipe entrará em contato via WhatsApp.</p>
                <button onClick={closeModal} className="mt-12 text-[10px] uppercase tracking-[0.3em] text-brand-green font-bold">Voltar</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Navigation - Transparente para deixar a imagem subir até o topo */}
      <nav className="fixed top-0 w-full z-50 px-8 md:px-16 py-8 flex justify-between items-center bg-transparent">
        <div className="flex items-center gap-2">
          <span className="text-sm font-black tracking-[0.2em] uppercase text-white">TRADERS <span className="font-extralight opacity-50">do AGRO</span></span>
        </div>
        
        <div className="hidden lg:flex gap-12 text-[10px] uppercase tracking-[0.3em] text-brand-gray/60 font-bold">
          <a href="#conceito" className="hover:text-white transition-colors">CONCEITO</a>
          <a href="#metodo" className="hover:text-white transition-colors">MÉTODO</a>
          <a href="#software" className="hover:text-white transition-colors">SDT POSITION</a>
          <a href="#mentor" className="hover:text-white transition-colors">MENTOR</a>
        </div>

        <button onClick={openModal} className="text-[9px] font-bold uppercase tracking-[0.2em] px-7 py-2.5 bg-brand-green border border-brand-green text-white hover:brightness-125 transition-all duration-700 shadow-[0_0_20px_rgba(0,128,0,0.4)]">
          QUERO UMA VAGA
        </button>
      </nav>

      {/* Hero Section - Atingindo o topo total */}
      <header className="relative min-h-screen flex flex-col items-start justify-center px-8 md:px-16 lg:px-32 overflow-hidden bg-brand-deep">
        <div className="absolute inset-0 z-0">
          <img src={IMAGES.hero_farm} className="w-full h-full object-cover opacity-100 animate-slow-pan grayscale-[0.2]" alt="Safra" />
          <div className="absolute inset-0 bg-gradient-to-r from-brand-deep via-brand-deep/60 to-transparent" />
        </div>

        <div className="relative z-20 max-w-5xl animate-slide-up pt-20">
          <div className="flex items-center gap-4 mb-10 reveal">
            <div className="w-8 h-px bg-brand-green"></div>
          </div>
          
          <h1 className="text-4xl md:text-6xl lg:text-8xl font-normal tracking-tighter leading-[0.9] mb-12 reveal delay-100 text-shadow-premium">
            Mentoria Traders do Agro:<br/> 
            <span className="italic font-light text-brand-gray text-2xl md:text-4xl lg:text-6xl block mt-4">PROGRAMA DE FORMAÇÃO PROFISSIONAL</span>
          </h1>
          
          <div className="max-w-2xl mb-14 reveal delay-200">
            <p className="text-xl md:text-2xl text-brand-gray leading-relaxed font-extralight border-l-2 border-brand-green pl-10">
              Formamos estrategistas Agro que dominam <br />
              <span className="text-white font-normal underline decoration-brand-green underline-offset-8">Trading, Derivativos, Políticas de Hedge e Margem Financeira</span><br />
              Seja o Produtor com a melhor margem do mercado ou ocupe o cargo de Profissional mais desejado do Agro.
            </p>
          </div>
          
          <div className="flex flex-col md:flex-row gap-12 items-center reveal delay-300 pl-10">
            <button onClick={openModal} className="w-full md:w-auto bg-brand-green text-white px-14 py-6 text-[11px] font-black uppercase tracking-[0.4em] hover:brightness-125 transition-all duration-500 shadow-[0_0_30px_rgba(0,128,0,0.3)]">
              QUERO UMA VAGA
            </button>
            <span className="text-[12px] uppercase tracking-[0.3em] text-brand-gray/50 font-bold italic">APENAS 50 VAGAS</span>
          </div>
        </div>
      </header>

      {/* Filosofia Section - Deep para Dark */}
      <Section id="conceito" className="!bg-gradient-to-b from-[#050705] to-[#173337]">
        <div className="max-w-5xl reveal">
          <span className={labelClasses}>FILOSOFIA DO TRADER DO AGRO</span>
          <div className="space-y-8 mb-16">
            <h2 className="text-4xl md:text-6xl font-normal tracking-tighter text-white leading-[1.1]">
              Produzir bem ja não é mais um problema tão sério para o Produtor. 
            </h2>
            <h2 className="text-2xl md:text-4xl font-light italic tracking-tight text-brand-green opacity-90 leading-[1.1]">
              É comprovado que mais da metade da margem financeira pode ir por uma decisão errada de venda. E é por isso que <em></em>le precisa de um estrategista confiável ao seu lado, alguém preparado e que o ajuda a enfrentar os desafios do Mercado.
            </h2>
          </div>
          
          <p className="text-brand-gray text-xl font-light leading-relaxed mb-8">
            O Trader do Agro nasce para ocupar esse lugar de confiança.<br /><br />
            É o profissional que <strong>estrutura decisões</strong>, não apostas. <br />
            Cria estratégias de venda, não achismos. <br />
            Protege caixa e melhora a margem financeira da fazenda. <br />
            Domina o mercado e o uso de derivativos como ferramenta de gestão <br />
            É Espcialista em operações dolarizadas e sabe se proteger da Variação Cambial. <br />
            Por Fim, aumenta em pelo menos 5% a Margem financeira da fazenda. <br />
          </p>
        </div>
      </Section>


      {/* Método Section - Deep para Dark */}
      <Section id="metodo" className="!bg-brand-deep !py-24">
        <div className="mb-20 reveal">
           <span className={labelClasses}>O QUE O TRADER APRENDE NA MENTORIA</span>
           <h2 className="text-5xl md:text-7xl font-light tracking-tighter text-white uppercase">14 Níveis de Domínio</h2>
        </div>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 reveal">
          {MODULES.map((m, i) => (
            <div key={i} className="group bg-white/5 border border-white/10 p-8 rounded-sm hover:border-brand-green transition-all duration-500 hover:bg-white/[0.08]">
              <div className="flex justify-between items-start mb-6">
                <span className="text-brand-green text-[12px] font-black tracking-widest font-mono">{m.title.split('. ')[0]}</span>
                <div className="w-6 h-px bg-white/10 group-hover:w-12 group-hover:bg-brand-green transition-all"></div>
              </div>
              <h5 className="text-xl font-medium text-white mb-4 leading-tight">{m.title.split('. ')[1]}</h5>
              <p className="text-brand-gray/60 text-sm font-light leading-relaxed group-hover:text-brand-gray transition-colors">{m.description}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* SDT Position Section - Deep para Dark */}
      <Section id="software" className="!bg-gradient-to-b from-[#050705] to-[#173337]">
        <div className="grid lg:grid-cols-2 gap-24 items-center">
          <div className="reveal">
            <div className="flex items-center gap-3 mb-8">
              <span className="px-3 py-1 bg-brand-green text-white text-[16px] font-bebas tracking-[0.2em] uppercase rounded-sm">O Trader do Agro tem acesso ao melhor sistema do Brasil de gerenciamento de Riscos</span>
              <div className="w-12 h-px bg-white/10"></div>
            </div>
            
            <h2 className="text-4xl md:text-6xl font-normal tracking-tighter text-white mb-10 leading-[0.95]">
              SDT Position: <br />
              <span className="text-brand-green italic">O Centro de Comando</span> <br />
              do Estrategista.
            </h2>
            
            <p className="text-brand-gray text-lg font-light leading-relaxed mb-12 max-w-lg">
              Tenha em mãos o melhor sistema de gerenciamento de hedge do Brasil. 
              A tecnologia que traduz a complexidade de Chicago para o lucro real na sua fazenda.
            </p>
            
            <div className="space-y-8">
              <div className="flex gap-6 items-start">
                <div className="w-10 h-10 flex-shrink-0 border border-brand-green bg-brand-green/10 flex items-center justify-center rounded-sm">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="1.5"><path d="M12 2v20M2 12h20"/><circle cx="12" cy="12" r="10"/></svg>
                </div>
                <div>
                  <h4 className="text-sm font-bold tracking-widest text-white uppercase mb-2">Política & Estratégia</h4>
                  <p className="text-brand-gray text-sm font-light leading-relaxed">Construa e acompanhe sua política de hedge com acompanhamento visual de metas e travas.</p>
                </div>
              </div>
              
              <div className="flex gap-6 items-start">
                <div className="w-10 h-10 flex-shrink-0 border border-brand-green bg-brand-green/10 flex items-center justify-center rounded-sm">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="1.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                </div>
                <div>
                  <h4 className="text-sm font-bold tracking-widest text-white uppercase mb-2">Gatilhos de Execução</h4>
                  <p className="text-brand-gray text-sm font-light leading-relaxed">Defina pontos exatos de entrada e saída (compra/venda) para eliminar o viés emocional da operação.</p>
                </div>
              </div>

              <div className="flex gap-6 items-start">
                <div className="w-10 h-10 flex-shrink-0 border border-brand-green bg-brand-green/10 flex items-center justify-center rounded-sm">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="1.5"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                </div>
                <div>
                  <h4 className="text-sm font-bold tracking-widest text-white uppercase mb-2">Ajuste MtM em Tempo Real</h4>
                  <p className="text-brand-gray text-sm font-light leading-relaxed">Visualize seu Mark-to-Market em R$ instantaneamente, garantindo total transparência sobre sua posição financeira.</p>
                </div>
              </div>
            </div>
          </div>
          
          <div className="reveal delay-400 relative">
            <div className="absolute -inset-10 bg-brand-green/10 blur-[120px] rounded-full"></div>
            <div className="relative group">
              <div className="absolute -inset-px bg-brand-green rounded-sm opacity-20 group-hover:opacity-60 transition-opacity"></div>
              <div className="relative bg-brand-deep border border-white/10 p-2 rounded-sm overflow-hidden">
                <div className="flex items-center gap-1.5 px-4 py-3 border-b border-white/5 bg-black/40 z-20 relative">
                  <div className="w-2 h-2 rounded-full bg-brand-green"></div>
                  <span className="ml-4 text-[9px] text-brand-gray/40 tracking-widest uppercase font-black">sdt_position_terminal v4.0</span>
                  <div className="ml-auto flex gap-2">
                    {IMAGES.sdt_carousel.map((_, i) => (
                      <div key={i} className={`w-1 h-1 rounded-full transition-all duration-500 ${currentSdtSlide === i ? 'bg-brand-green scale-150' : 'bg-white/20'}`}></div>
                    ))}
                  </div>
                </div>
                <div className="relative h-[200px] md:h-[400px] lg:h-[350px] overflow-hidden">
                  {IMAGES.sdt_carousel.map((img, i) => (
                    <img 
                      key={i}
                      src={img} 
                      className={`absolute inset-0 w-full h-full object-cover transition-all duration-200 ease-in-out ${currentSdtSlide === i ? 'opacity-100 scale-100' : 'opacity-0 scale-110'}`} 
                      alt={`SDT Position Interface ${i + 1}`} 
                    />
                  ))}
                </div>
              </div>
            </div>
            
            {/* Elementos flutuantes de UI */}
            <div className="absolute -top-10 -right-10 bg-brand-green border border-white/20 p-5 shadow-2xl hidden md:block z-30">
               <div className="text-[10px] text-white font-black mb-1 opacity-70 uppercase tracking-tighter">Ajustes Positivos Gerenciados</div>
               <div className="text-xl font-mono text-white font-bold tracking-tighter">+ de R$ 8,0 Milhões</div>
            </div>
          </div>
        </div>
      </Section>

      {/* Mentor Section - Dark para Deep */}
      <Section id="mentor" className="!bg-gradient-to-b from-[#173337] to-[#050705] !py-12 md:!py-24">
        <span className={labelClasses}>A LIDERANÇA</span>
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          <div className="reveal">
            <div className="border-4 border-brand-green p-1 relative group overflow-hidden max-w-sm mx-auto lg:max-w-none">
              <img src={IMAGES.mentor_portrait} className="w-full h-auto grayscale opacity-90 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-1000" alt="Mentor" />
            </div>
          </div>
          <div className="reveal delay-200">
            <h3 className="text-5xl md:text-7xl font-normal text-white mb-8 md:mb-12 tracking-tighter">Evandro Góes</h3>
            <p className="text-brand-gray text-lg md:text-xl font-extralight leading-relaxed mb-12 border-l-4 border-brand-green pl-6 md:pl-10">
              Uma das Maiores autoridades em <span className="text-brand-green italic font-bold">Hedge Agrícola no Brasil</span>. <br /><br />
              + de 12 anos de experiência em Hedge aplicado ao Produtor rural. <br />
              Atuou por 5 anos no Itaú BBA e por outros 5 anos na Louis Dreyfus Company como Trader de Commodities Agrícolas.<br /><br />
              Construiu sua carreira unindo a precisão de mercados internacionais (como Chicago) à realidade operacional da fazenda brasileira.<br /><br />
              Mais do que teoria, atua na execução real de mercado, lado a lado com produtores, estruturando decisões que protegem caixa, reduzem risco e aumentam resultado financeiro.<br /><br />
              Criador de um método próprio e exclusivo, validado na prática, que gera em média 5% de ganho adicional de margem financeira para as fazendas atendidas.<br /><br />
              Evandro não forma analistas. Forma estrategistas do produtor rural — profissionais preparados para tomar decisões financeiras em um dos mercados mais complexos do mundo.
            </p>
            
            {/* Estatísticas Responsivas */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-y-10 gap-x-6 md:gap-x-12 pl-6 md:pl-10">
              <div>
                <div className="text-2xl md:text-3xl font-bold text-white">12+</div>
                <div className="text-[8px] md:text-[9px] text-brand-green uppercase tracking-[0.2em] font-black leading-tight">ANOS DE MERCADO</div>
              </div>
              <div>
                <div className="text-2xl md:text-3xl font-bold text-white">+R$500 mm</div>
                <div className="text-[8px] md:text-[9px] text-brand-green uppercase tracking-[0.2em] font-black leading-tight">GESTÃO DE RISCO</div>
              </div>
              <div>
                <div className="text-2xl md:text-3xl font-bold text-white">R$8 mm +</div>
                <div className="text-[8px] md:text-[9px] text-brand-green uppercase tracking-[0.2em] font-black leading-tight">DE AJUSTE POSITIVO EM DERIVATIVOS</div>
              </div>
              <div>
                <div className="text-2xl md:text-3xl font-bold text-white">+200 Mil</div>
                <div className="text-[8px] md:text-[9px] text-brand-green uppercase tracking-[0.2em] font-black leading-tight">CONTRATOS NEGOCIADOS</div>
              </div>
              <div>
                <div className="text-2xl md:text-3xl font-bold text-white">+3,5 mm</div>
                <div className="text-[8px] md:text-[9px] text-brand-green uppercase tracking-[0.2em] font-black leading-tight">SACAS DE SOJA SOB GESTÃO</div>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* Compromisso Estratégico - Deep para Dark */}
      <Section className="!bg-gradient-to-b from-[#050705] to-[#173337] !py-32">
        <div className="max-w-5xl mx-auto text-center reveal">
          <span className={labelClasses}>COMPROMISSO ESTRATÉGICO</span>
          <h2 className="text-4xl md:text-6xl font-normal tracking-tighter text-white mb-16 leading-[1.1] max-w-4xl mx-auto">
            O Agronegócio <span className="text-brand-green italic font-light">não perdoa amadores.</span>
          </h2>
          
          <div className="max-w-3xl mx-auto">
            <p className="text-brand-gray text-2xl font-extralight leading-relaxed mb-12">
              O tempo de contar com a sorte ou apenas com o clima acabou. No novo ciclo das commodities, a sobrevivência e a prosperidade pertencem a quem domina a proteção do capital.
            </p>
            <p className="text-white text-xl font-medium tracking-tight mb-16 italic border-t border-white/5 pt-12">
              Este é o seu convite para sair da arquibancada e assumir o controle da sua mesa de operações.
            </p>
            
            <button onClick={openModal} className="bg-brand-green text-white px-16 py-7 text-[12px] font-black uppercase tracking-[0.4em] hover:brightness-125 transition-all duration-500 shadow-[0_20px_40px_rgba(0,128,0,0.3)]">
              SOLICITAR ACESSO À MENTORIA
            </button>
          </div>
        </div>
      </Section>

      {/* Footer */}
      <footer className="py-20 bg-black px-8 text-center">
         <div className="flex flex-col items-center gap-6">
           <span className="text-[10px] font-black tracking-[0.4em] uppercase text-brand-gray/40">TRADERS do AGRO © 2025</span>
           <div className="flex gap-8 text-[9px] text-brand-green uppercase tracking-widest font-bold">
             <span className="hover:text-white cursor-pointer transition-colors">Terms of access</span>
             <span className="text-brand-gray/10">|</span>
             <span className="hover:text-white cursor-pointer transition-colors">Strategic Risk Advisory</span>
           </div>
         </div>
      </footer>
    </div>
  );
};

export default App;
