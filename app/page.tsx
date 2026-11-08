import MapClient from '@/components/MapClient';
import { parseMapState } from '@/lib/urlState';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // El estado compartido en la URL (aoi, layers, years, seasons, hour, lat, lng, z)
  // se resuelve en el servidor para que el primer render ya coincida con el enlace.
  const initial = parseMapState(await searchParams);
  return <MapClient initial={initial} />;
}
