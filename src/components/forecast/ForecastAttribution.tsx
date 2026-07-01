import { CardFooter } from '../ui/card';
import xweatherDark from '../../assets/providers/xweather-dark.svg';
import xweatherLight from '../../assets/providers/xweather-light.svg';
import owmMaster from '../../assets/providers/openweathermap-master.png';
import owmNegative from '../../assets/providers/openweathermap-negative.png';
import nwsLogo from '../../assets/providers/nws.svg';
import openMeteoLogo from '../../assets/providers/open-meteo.png';

const LOGO_HEIGHT = 32;

interface ProviderAttribution {
  text: string;
  lightLogo?: string;
  darkLogo?: string;
  alt: string;
}

const PROVIDERS: Record<string, ProviderAttribution> = {
  aeris: {
    text: 'Powered by',
    lightLogo: xweatherDark,
    darkLogo: xweatherLight,
    alt: 'Vaisala Xweather',
  },
  owm: {
    text: 'Powered by',
    lightLogo: owmMaster,
    darkLogo: owmNegative,
    alt: 'OpenWeather',
  },
  nws: {
    text: 'Powered by',
    lightLogo: nwsLogo,
    darkLogo: nwsLogo,
    alt: 'National Weather Service',
  },
  openmeteo: {
    text: 'Powered by',
    lightLogo: openMeteoLogo,
    darkLogo: openMeteoLogo,
    alt: 'Open-Meteo.com',
  },
  iqair: {
    text: 'Powered by',
    alt: 'IQAir',
  },
};

export function ForecastAttribution({ source }: { source?: string | null }) {
  if (!source) return null;
  const provider = PROVIDERS[source];
  if (!provider) return null;

  const hasLogo = !!provider.lightLogo;
  const hasDarkVariant = hasLogo && provider.lightLogo !== provider.darkLogo;

  const textStyle: React.CSSProperties = {
    fontSize: 'var(--text-micro)',
    color: 'var(--muted-foreground)',
    fontFamily: 'var(--font-sans)',
    fontWeight: 400,
  };

  return (
    <CardFooter style={{ padding: '0.625rem var(--card-pad)' }}>
      <span style={textStyle}>{provider.text}</span>
      {hasLogo ? (
        <>
          <img
            src={provider.lightLogo}
            alt={provider.alt}
            className={hasDarkVariant ? 'dark:hidden' : undefined}
            style={{ height: LOGO_HEIGHT, width: 'auto', marginLeft: 8 }}
          />
          {hasDarkVariant && (
            <img
              src={provider.darkLogo}
              alt={provider.alt}
              className="hidden dark:block"
              style={{ height: LOGO_HEIGHT, width: 'auto', marginLeft: 8 }}
            />
          )}
        </>
      ) : (
        <span style={{ ...textStyle, fontWeight: 600, marginLeft: 6 }}>
          {provider.alt}
        </span>
      )}
    </CardFooter>
  );
}
