import React from 'react';

interface TrustWalletShieldProps {
  size?: number;
  className?: string;
}

export const TrustWalletShield: React.FC<TrustWalletShieldProps> = ({
  size = 32,
  className = '',
}) => {
  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 rounded-xl overflow-hidden bg-white shadow-md ${className}`}
    >
      <img
        src="./assets/aistudio/Screenshot_20261014212008_a818ec9f.jpg"
        alt="TRUST WALLET"
        width={size}
        height={size}
        className="object-contain block"
      />
    </div>
  );
};
