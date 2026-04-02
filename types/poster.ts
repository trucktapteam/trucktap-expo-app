export type PosterTemplate = 'simple' | 'modern' | 'bold';

export interface PosterData {
  truckName: string;
  cuisine: string;
  photoUrl?: string;
  qrImage: string;
  slogan?: string;
}

export interface PosterTemplateProps extends PosterData {
  backgroundColor?: string;
  showPhoto?: boolean;
}

export interface PosterConfig {
  template: PosterTemplate;
  slogan: string;
  backgroundColor: string;
  showPhoto: boolean;
}
