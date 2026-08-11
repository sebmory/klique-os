"use client";

import { QRCodeSVG } from "qrcode.react";

type QrCodeBlockProps = {
  value: string;
  size?: number;
};

export function QrCodeBlock({ value, size = 220 }: QrCodeBlockProps) {
  return (
    <div
      style={{
        display: "grid",
        placeItems: "center",
        padding: "0.95rem",
        borderRadius: "16px",
        background: "#ffffff",
        border: "1px solid #e5e7eb",
        boxShadow: "0 8px 24px rgba(17, 24, 39, 0.08)",
      }}
    >
      <QRCodeSVG
        value={value}
        size={size}
        level="H"
        includeMargin
        marginSize={4}
        bgColor="#ffffff"
        fgColor="#111111"
        imageSettings={{
          src: "",
          x: 0,
          y: 0,
          height: 0,
          width: 0,
          excavate: false,
        }}
      />
    </div>
  );
}
