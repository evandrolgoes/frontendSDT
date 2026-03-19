
import React from 'react';

interface SectionProps {
  children: React.ReactNode;
  className?: string;
  id?: string;
  gradientFrom?: string;
  gradientTo?: string;
}

export const Section: React.FC<SectionProps> = ({ children, className = "", id, gradientFrom, gradientTo }) => {
  const gradientClass = gradientFrom && gradientTo ? `bg-gradient-to-b from-[${gradientFrom}] to-[${gradientTo}]` : '';
  
  return (
    <section 
      id={id} 
      className={`py-16 px-6 md:py-24 md:px-12 lg:px-24 relative overflow-hidden ${gradientClass} ${className}`}
    >
      <div className="max-w-6xl mx-auto relative z-10">
        {children}
      </div>
    </section>
  );
};
