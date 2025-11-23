// src/components/layout/Layout.tsx

import React from 'react';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    return (
        <div className="w-screen h-screen overflow-hidden">
            {children}
        </div>
    );
};
