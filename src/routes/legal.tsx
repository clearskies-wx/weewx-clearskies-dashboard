// legal.tsx — Legal page (/legal)
// Placeholder legal/privacy text card.

import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '../components/ui/card';

export function LegalPage() {
  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground">Legal &amp; Privacy</h1>

      <Card>
        <CardHeader>
          <CardTitle>Legal and Privacy Information</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Legal and privacy information will be configured by the station operator.
          </p>
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
            This page is a placeholder. Configure your station&apos;s legal and privacy
            content via the Clear Skies configuration UI. Ensure you include any
            applicable jurisdiction-specific disclosures for your location.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default LegalPage;
