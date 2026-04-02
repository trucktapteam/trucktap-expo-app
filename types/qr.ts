/**
 * QR Code System Type Definitions
 * 
 * This module defines the type system for TruckTap's modular QR code generator.
 * The system is designed to be extensible and reusable across:
 * - Marketing posters
 * - Social media exports
 * - Printable materials
 * - Digital sharing
 * 
 * Future enhancements planned:
 * - Custom logo uploads (SVG/PNG)
 * - Background frame options
 * - Color customization
 * - Template-specific QR styles
 */

export type QRVisualStyle = 'standard' | 'rounded' | 'dots' | 'gradient' | 'logo-ready';

export interface QRLogoConfig {
  includeLogo: boolean;
  logoSize: number;
  logoMargin: number;
  logoBackgroundColor?: string;
}

export interface QRGenerationOptions {
  style: QRVisualStyle;
  logoConfig: QRLogoConfig;
  width?: number;
  margin?: number;
}

export interface QRStyleOption {
  id: QRVisualStyle;
  name: string;
  description: string;
}

export interface QRCodeComponentProps {
  url: string;
  options: QRGenerationOptions;
  onGenerated?: (dataUrl: string) => void;
  onError?: (error: Error) => void;
}
