// custom-page.tsx — Operator-defined custom pages at /:slug (ADR-024)

import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '../components/ui/card';
import { useApiQuery } from '../hooks/useApiQuery';
import { getPageContent, ApiError } from '../api/client';
import NotFoundPage from './not-found';

function TileSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-muted ${className ?? 'h-32'}`}
      aria-hidden="true"
    />
  );
}

export function CustomPage() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation('common');

  const { data, loading, error } = useApiQuery(
    (signal) => getPageContent(slug ?? '', signal),
    { deps: [slug], skip: !slug },
  );

  if (!slug) {
    return <NotFoundPage />;
  }

  if (error instanceof ApiError && error.status === 404) {
    return <NotFoundPage />;
  }

  if (error) {
    return <NotFoundPage />;
  }

  const displayTitle = slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground">{displayTitle}</h1>

      <Card aria-busy={loading}>
        <CardHeader>
          <CardTitle as="h2">{displayTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <>
              <span className="sr-only" role="status">{t('customPageLoading')}</span>
              <TileSkeleton className="h-32" />
            </>
          ) : data && data.data.markdown ? (
            <div className="text-foreground leading-relaxed [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-4 [&_h2]:mb-2 [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1 [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-3 [&_li]:mb-1 [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:my-3 [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_pre]:bg-muted [&_pre]:p-4 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:my-3 [&_hr]:border-border [&_hr]:my-4 [&_table]:w-full [&_table]:border-collapse [&_th]:text-left [&_th]:border [&_th]:border-border [&_th]:px-3 [&_th]:py-2 [&_th]:bg-muted [&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2" style={{ fontSize: 'var(--text-body)' }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {data.data.markdown}
              </ReactMarkdown>
            </div>
          ) : (
            <p className="text-muted-foreground" style={{ fontSize: 'var(--text-body)' }}>
              {t('customPageNoContent')}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default CustomPage;
