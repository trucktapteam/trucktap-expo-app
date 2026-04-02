import React from 'react';
import TemplateSimple from './TemplateSimple';
import TemplateModern from './TemplateModern';
import TemplateBold from './TemplateBold';
import type { PosterTemplate, PosterTemplateProps } from '@/types/poster';

interface PosterRendererProps extends PosterTemplateProps {
  template: PosterTemplate;
}

export default function PosterRenderer({
  template,
  ...props
}: PosterRendererProps) {
  switch (template) {
    case 'simple':
      return <TemplateSimple {...props} />;
    case 'modern':
      return <TemplateModern {...props} />;
    case 'bold':
      return <TemplateBold {...props} />;
    default:
      return <TemplateSimple {...props} />;
  }
}
