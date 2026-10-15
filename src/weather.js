import { setLocationTz } from './clock.js';
import { localGet, localSet, syncGet, syncSet } from './storage.js';
import { safeFetch } from './util.js';

// ─────────────────────────────────────────────────────────────────────────────
// WEATHER  (ZIP via zippopotam.us, city via open-meteo geocoding)
// ─────────────────────────────────────────────────────────────────────────────

const WEATHER_DESC = {
  0:'Clear',1:'Mostly clear',2:'Partly cloudy',3:'Overcast',45:'Foggy',48:'Icy fog',
  51:'Light drizzle',53:'Drizzle',55:'Heavy drizzle',56:'Freezing drizzle',57:'Heavy freezing drizzle',
  61:'Light rain',63:'Rain',65:'Heavy rain',66:'Freezing rain',67:'Heavy freezing rain',
  71:'Light snow',73:'Snow',75:'Heavy snow',77:'Snow grains',80:'Rain showers',81:'Rain showers',
  82:'Violent rain',85:'Snow showers',86:'Heavy snow showers',95:'Thunderstorm',96:'Thunderstorm + hail',99:'Thunderstorm + heavy hail'
};
const WEATHER_CACHE_KEY = 'cachedWeather';
const WEATHER_CACHE_TIME_KEY = 'cachedWeatherTime';
const WEATHER_CACHE_DURATION = 2 * 60 * 60 * 1000;

const weatherEl = document.getElementById('weather');
const toggleZipBtn = document.getElementById('toggle-zip');
const zipRowEl = document.getElementById('zip-row');
const zipInputEl = document.getElementById('zip-input');
const setZipBtn = document.getElementById('set-zip');
const cToF = c => Math.round(c * 9 / 5 + 32);

async function fetchAndRenderWeather(lat, lon, city = '') {
  weatherEl.textContent = 'fetching…';
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&timezone=auto`;
    const data = await safeFetch(url);
    if (!data.current_weather) throw new Error('bad weather response');
    const { temperature: tempC, weathercode: code } = data.current_weather;
    const desc = WEATHER_DESC[code] ?? 'Unknown';
    const label = `${city ? city + ' · ' : ''}${cToF(tempC)}°F · ${desc}`;
    weatherEl.textContent = label;
    // capture the location's timezone so the clock + greeting reflect it
    const off = data.utc_offset_seconds;
    if (typeof off === 'number') { setLocationTz(off); await localSet({ locationTz: off }); }
    await localSet({ [WEATHER_CACHE_KEY]: { text: label, lat, lon, city, tz: off }, [WEATHER_CACHE_TIME_KEY]: Date.now() });
  } catch {
    weatherEl.textContent = 'weather unavailable';
  }
}

async function geocodeQuery(qRaw) {
  const q = qRaw.trim();
  if (/^\d{5}$/.test(q)) {
    const data = await safeFetch(`https://api.zippopotam.us/us/${q}`);
    const place = data.places?.[0];
    if (!place) throw new Error('ZIP not found');
    return { lat: +place.latitude, lon: +place.longitude, city: `${place['place name']}, ${place['state abbreviation']}` };
  }
  const data = await safeFetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1`);
  const r = data.results?.[0];
  if (!r) throw new Error('location not found');
  return { lat: r.latitude, lon: r.longitude, city: `${r.name}${r.admin1 ? ', ' + r.admin1 : ''}` };
}

async function setLocationFromQuery(q) {
  weatherEl.textContent = 'locating…';
  try {
    const loc = await geocodeQuery(q);
    await syncSet({ customLocation: loc });
    await fetchAndRenderWeather(loc.lat, loc.lon, loc.city);
  } catch (e) {
    weatherEl.textContent = e.message === 'location not found' || e.message === 'ZIP not found'
      ? `“${q}” not found` : 'lookup failed';
  }
}

export async function getWeather() {
  const data = await localGet([WEATHER_CACHE_KEY, WEATHER_CACHE_TIME_KEY]);
  const synced = await syncGet('customLocation');
  const now = Date.now();
  if (data[WEATHER_CACHE_KEY] && now - (data[WEATHER_CACHE_TIME_KEY] ?? 0) < WEATHER_CACHE_DURATION) {
    weatherEl.textContent = data[WEATHER_CACHE_KEY].text;
    return;
  }
  const loc = synced?.customLocation || await browserLocation();
  if (!loc) { weatherEl.textContent = 'set your location ⌖'; return; }
  await fetchAndRenderWeather(loc.lat, loc.lon, loc.city ?? '');
}

// Ask the browser for a position when no location has been saved; null if denied.
function browserLocation() {
  return new Promise(res => {
    if (!navigator.geolocation) return res(null);
    navigator.geolocation.getCurrentPosition(
      p => res({ lat: +p.coords.latitude.toFixed(4), lon: +p.coords.longitude.toFixed(4) }),
      () => res(null),
      { timeout: 8000, maximumAge: 60 * 60 * 1000 }
    );
  });
}

toggleZipBtn.addEventListener('click', () => {
  zipRowEl.classList.toggle('hidden');
  if (!zipRowEl.classList.contains('hidden')) zipInputEl.focus();
});
function submitZip() {
  const q = zipInputEl.value.trim();
  if (!q) return;
  setLocationFromQuery(q);
  zipInputEl.value = '';
  zipRowEl.classList.add('hidden');
}
setZipBtn.addEventListener('click', submitZip);
zipInputEl.addEventListener('keydown', e => { if (e.key === 'Enter') submitZip(); });
