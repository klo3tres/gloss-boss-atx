const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('./.env.local', 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    const key = parts[0].trim();
    const val = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
    env[key] = val;
  }
});

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

function str(v) {
  return v == null ? '' : String(v).trim();
}

async function run() {
  const [photosRes, mediaRes] = await Promise.all([
    supabase.from('job_photos').select('*').order('created_at', { ascending: false }).limit(200),
    supabase.from('job_media').select('*').order('created_at', { ascending: false }).limit(200),
  ]);
  const rawPhotos = [...(photosRes.data ?? []), ...(mediaRes.data ?? [])];
  const appointmentIds = [...new Set(rawPhotos.map((p) => String(p.appointment_id ?? '')).filter(Boolean))];
  const techIds = [...new Set(rawPhotos.map((p) => String(p.technician_id ?? p.uploaded_by ?? '')).filter(Boolean))];
  const [apptMeta, techMeta] = await Promise.all([
    appointmentIds.length ? supabase.from('appointments').select('id, guest_name, guest_email, vehicle_description, booking_vehicles, service_slug').in('id', appointmentIds) : Promise.resolve({ data: [] }),
    techIds.length ? supabase.from('profiles').select('id, full_name, email').in('id', techIds) : Promise.resolve({ data: [] }),
  ]);
  const apptById = new Map((apptMeta.data ?? []).map((a) => [String(a.id), a]));
  const techById = new Map((techMeta.data ?? []).map((t) => [String(t.id), t]));

  const recentPhotos = rawPhotos
    .map((p) => {
      const appt = apptById.get(String(p.appointment_id ?? '')) ?? {};
      const tech = techById.get(String(p.technician_id ?? p.uploaded_by ?? '')) ?? {};
      const url = String(p.url ?? p.public_url ?? p.media_url ?? p.file_url ?? '').trim();
      const vehicleIndex = typeof p.vehicle_index === 'number' ? p.vehicle_index : Number.isFinite(Number(p.vehicle_index)) ? Number(p.vehicle_index) : null;
      const bookingVehicles = Array.isArray(appt.booking_vehicles) ? appt.booking_vehicles : [];
      const indexedVehicle = vehicleIndex != null ? bookingVehicles[vehicleIndex] ?? bookingVehicles[vehicleIndex - 1] : null;
      const indexedLabel = indexedVehicle
        ? [indexedVehicle.year, indexedVehicle.make, indexedVehicle.model, indexedVehicle.color].map((v) => (v == null ? '' : String(v))).filter(Boolean).join(' ')
        : '';
      const vehicleLabel =
        String(p.vehicle_label ?? p.vehicle_description ?? '').trim() ||
        indexedLabel ||
        String(appt.vehicle_description ?? '').trim() ||
        `Vehicle ${vehicleIndex != null ? vehicleIndex + 1 : ''}`.trim();
      return {
        ...p,
        id: String(p.id ?? url),
        url,
        category: String(p.photo_category ?? p.category ?? 'photo'),
        created_at: String(p.created_at ?? ''),
        uploader: String(tech.full_name ?? tech.email ?? p.uploader ?? ''),
        customer_name: String(appt.guest_name ?? ''),
        customer_email: String(appt.guest_email ?? ''),
        vehicle_index: vehicleIndex,
        vehicle_label: vehicleLabel,
        vehicle_color: String(p.vehicle_color ?? indexedVehicle?.color ?? ''),
        service_type: String(p.service_type ?? appt.service_slug ?? ''),
        booking_vehicles: appt.booking_vehicles,
      };
    })
    .filter((p) => p.url);

  console.log('recentPhotos count:', recentPhotos.length);

  // Filter photos like WorkOrderUploadsTab
  const query = '';
  const serviceFilter = 'all';
  const filteredPhotos = recentPhotos.filter((p) => {
    if (!p.url) return false;
    const service = str(p.service_type).toLowerCase();
    if (serviceFilter !== 'all' && !service.includes(serviceFilter)) return false;
    if (!query) return true;
    return [
      p.category,
      p.vehicle_label,
      p.vehicle_description,
      p.vehicle_color,
      p.customer_name,
      p.customer_email,
      p.service_type,
      p.uploader,
      p.created_at,
    ].filter(Boolean).join(' ').toLowerCase().includes(query);
  });
  console.log('filteredPhotos count:', filteredPhotos.length);

  const map = new Map();
  for (const p of filteredPhotos) {
    const jobId = p.appointment_id || p.fallback_booking_id || 'orphan';
    const label = p.vehicle_label || p.vehicle_description || `Vehicle ${Number(p.vehicle_index ?? 0) + 1}`;
    const token = p.vehicle_index != null ? `vehicle-${p.vehicle_index}` : label;
    const groupKey = `${jobId}-${token}`;
    const row = map.get(groupKey) ?? {
      groupKey,
      jobId,
      vehicleLabel: label,
      customer: p.customer_name || p.customer_email || 'Customer',
      service: p.service_type || 'Mobile detail',
      photos: [],
    };
    row.photos.push(p);
    map.set(groupKey, row);
  }
  const groups = Array.from(map.values());
  console.log('groups count:', groups.length);
  if (groups.length > 0) {
    console.log('First group details:', {
      groupKey: groups[0].groupKey,
      jobId: groups[0].jobId,
      vehicleLabel: groups[0].vehicleLabel,
      customer: groups[0].customer,
      photosCount: groups[0].photos.length
    });
  }
}

run();
