import { Link } from 'react-router-dom';
import { useMockData } from '../../mock/index';

export function Footer() {
  const { station } = useMockData();

  return (
    <footer className="mt-auto border-t border-border px-4 py-3 text-sm text-muted-foreground">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <Link
          to="/legal"
          className="hover:text-foreground underline underline-offset-4 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded"
        >
          Legal / Privacy
        </Link>
        <span aria-hidden="true">·</span>
        <span>© {new Date().getFullYear()} {station.name}</span>
        <span aria-hidden="true">·</span>
        <span>Powered by Clear Skies</span>
      </div>
    </footer>
  );
}
