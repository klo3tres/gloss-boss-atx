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

async function run() {
  const { data, error } = await supabase.from('job_media').select('category, photo_category, vehicle_label');
  if (error) {
    console.error('Error fetching categories:', error);
    return;
  }
  const categories = new Set();
  const photoCategories = new Set();
  const vehicleLabels = new Set();
  data.forEach(r => {
    categories.add(r.category);
    photoCategories.add(r.photo_category);
    vehicleLabels.add(r.vehicle_label);
  });
  console.log('Categories:', Array.from(categories));
  console.log('Photo Categories:', Array.from(photoCategories));
  console.log('Vehicle Labels:', Array.from(vehicleLabels));
}

run();
