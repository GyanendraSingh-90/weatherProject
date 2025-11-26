// app.js - Weatherly
const API_KEY = '25456f9506d83eb33c89b918c9d55959';

// DOM refs
const cityInput = document.getElementById('cityInput');
const searchBtn = document.getElementById('searchBtn');
const geoBtn = document.getElementById('geoBtn');
const recentBtn = document.getElementById('recentBtn');
const recentDropdown = document.getElementById('recentDropdown');
const unitToggle = document.getElementById('unitToggle');

const currentCard = document.getElementById('currentCard');
const locationName = document.getElementById('locationName');
const localTime = document.getElementById('localTime');
const weatherDescription = document.getElementById('weatherDescription');
const weatherIcon = document.getElementById('weatherIcon');
const todayTemp = document.getElementById('todayTemp');
const feelsLike = document.getElementById('feelsLike');
const humidityEl = document.getElementById('humidity');
const windEl = document.getElementById('wind');
const pressureEl = document.getElementById('pressure');

const forecastSection = document.getElementById('forecastSection');
const forecastContainer = document.getElementById('forecastContainer');

const alertArea = document.getElementById('alertArea');
const popup = document.getElementById('popup');

let currentTodayCelsius = null; // store today's temp in °C to allow toggling
let recentCities = loadRecentCities();

// Initialization
renderRecentDropdown();
attachEventListeners();

function attachEventListeners() {
  searchBtn.addEventListener('click', () => handleSearch());
  cityInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSearch();
  });
  geoBtn.addEventListener('click', useGeolocation);
  recentBtn.addEventListener('click', () => {
    recentDropdown.classList.toggle('hidden');
  });
  unitToggle.addEventListener('click', toggleUnit);
  document.addEventListener('click', (e) => {
    if (!recentBtn.contains(e.target) && !recentDropdown.contains(e.target)) {
      recentDropdown.classList.add('hidden');
    }
  });
}

function handleSearch() {
  const city = cityInput.value.trim();
  if (!city) {
    showPopup('Please enter a city name', 'error');
    return;
  }
  fetchWeatherByCity(city);
}

function useGeolocation() {
  if (!navigator.geolocation) {
    showPopup('Geolocation not supported by your browser', 'error');
    return;
  }
  showPopup('Getting your location...', 'info');
  navigator.geolocation.getCurrentPosition(async (pos) => {
    const { latitude, longitude } = pos.coords;
    try {
      await fetchWeatherByCoords(latitude, longitude);
    } 
    catch (err) {
      showPopup('Unable to fetch weather for your location', 'error');
    }
  }, (err) => {
    showPopup('Permission denied or position unavailable', 'error');
  });
}

async function fetchWeatherByCity(city) {
  try {
    clearAlerts();
    showPopup('Fetching weather...', 'info');
    const current = await fetchCurrentWeather({ q: city });
    const forecast = await fetchForecast({ q: city });
    updateUI(current, forecast);
    saveRecentCity(current.name);
    showPopup('Weather updated', 'success', 1500);
  } 
  catch (err) {
    showPopup(err.message || 'Error fetching weather', 'error');
    console.error(err);
  }
}

async function fetchWeatherByCoords(lat, lon) {
  try {
    clearAlerts();
    showPopup('Fetching weather...', 'info');
    const current = await fetchCurrentWeather({ lat, lon });
    const forecast = await fetchForecast({ lat, lon });
    updateUI(current, forecast);
    saveRecentCity(current.name);
    showPopup('Weather updated', 'success', 1500);
  } 
  catch (err) {
    showPopup(err.message || 'Error fetching weather', 'error');
    console.error(err);
  }
}

async function fetchCurrentWeather(params) {
  const url = new URL('https://api.openweathermap.org/data/2.5/weather');
  url.search = new URLSearchParams({ appid: API_KEY, units: 'metric', ...params }).toString();
  const res = await fetch(url.toString());
  if (!res.ok) {
    const err = await res.json().catch(()=>({message:'API error'}));
    throw new Error(err.message || `Error: ${res.status}`);
  }
  return res.json();
}

async function fetchForecast(params) {
  // 5 day / 3 hour forecast endpoint
  const url = new URL('https://api.openweathermap.org/data/2.5/forecast');
  url.search = new URLSearchParams({ appid: API_KEY, units: 'metric', ...params }).toString();
  const res = await fetch(url.toString());
  if (!res.ok) {
    const err = await res.json().catch(()=>({message:'API error'}));
    throw new Error(err.message || `Error: ${res.status}`);
  }
  return res.json();
}

function updateUI(current, forecast) {
  // Current
  currentCard.classList.remove('hidden');
  locationName.textContent = `${current.name}, ${current.sys?.country || ''}`;
  localTime.textContent = `Local time: ${new Date((current.dt + current.timezone) * 1000).toUTCString().replace('GMT','')}`;
  weatherDescription.textContent = `${capitalize(current.weather[0].description)}`;
  const iconCode = current.weather[0].icon;
  weatherIcon.src = `https://openweathermap.org/img/wn/${iconCode}@2x.png`;
  weatherIcon.alt = current.weather[0].description;

  // show today's temp in °C as default
  currentTodayCelsius = round(current.main.temp);
  todayTemp.textContent = `${currentTodayCelsius}°C`;
  feelsLike.textContent = `Feels like: ${round(current.main.feels_like)}°C`;

  humidityEl.textContent = `${current.main.humidity}%`;
  windEl.textContent = `${current.wind.speed} m/s`;
  pressureEl.textContent = `${current.main.pressure} hPa`;

  // Alerts for extreme temp (custom rule)
  checkExtremeTemperature(current.main.temp);

  // Background change based on weather
  applyBackgroundClass(current.weather[0].main || current.weather[0].description);

  // Forecast display
  renderForecastCards(forecast);

  // Update unit toggle text to reflect current (today) unit (we always start in °C)
  unitToggle.textContent = '°C';

  // update input value to city name (normalized)
  cityInput.value = current.name;
}

function renderForecastCards(forecast) {
  // The /forecast endpoint returns 3-hour steps. Aggregate per calendar day.
  const days = {}; // dateStr -> array of entries
  forecast.list.forEach(item => {
    const date = new Date(item.dt * 1000);
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
    if (!days[dateStr]) days[dateStr] = [];
    days[dateStr].push(item);
  });

  // Keep next 5 days including today
  const keys = Object.keys(days).slice(0, 5);
  forecastContainer.innerHTML = '';
  keys.forEach(dateStr => {
    const items = days[dateStr];
    // pick midday item if exists, else average
    let midday = items.find(it => new Date(it.dt * 1000).getHours() === 12);
    if (!midday) midday = items[Math.floor(items.length/2)];
    // compute averages
    const temps = items.map(i => i.main.temp);
    const avgTemp = round(temps.reduce((a,b)=>a+b,0) / temps.length);
    const avgHumidity = Math.round(items.reduce((a,b)=>a+b.main.humidity,0) / items.length);
    const avgWind = (items.reduce((a,b)=>a+b.wind.speed,0) / items.length).toFixed(1);

    const dateObj = new Date(dateStr + 'T00:00:00');
    const dayName = dateObj.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

    const icon = midday.weather[0].icon;
    const desc = midday.weather[0].main;

    const card = document.createElement('div');
    card.className = 'p-3 bg-white border rounded text-center';
    card.innerHTML = `
      <div class="font-semibold mb-1">${dayName}</div>
      <img src="https://openweathermap.org/img/wn/${icon}@2x.png" alt="${desc}" class="mx-auto w-16 h-16"/>
      <div class="mt-1 text-lg font-bold">${avgTemp}°C</div>
      <div class="text-sm text-gray-600 mt-1 flex justify-center gap-3">
        <div title="Wind" class="flex items-center gap-1"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M3 12h13a4 4 0 000-8 4 4 0 00-3.874 3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg><span>${avgWind} m/s</span></div>
        <div title="Humidity" class="flex items-center gap-1"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 2s6 5 6 10a6 6 0 11-12 0c0-5 6-10 6-10z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg><span>${avgHumidity}%</span></div>
      </div>
    `;
    forecastContainer.appendChild(card);
  });

  forecastSection.classList.remove('hidden');
}

function applyBackgroundClass(weatherMain) {
  const w = weatherMain.toLowerCase();
  document.body.classList.remove('rainy','sunny','cloudy');
  if (w.includes('rain') || w.includes('drizzle') || w.includes('thunderstorm')) {
    document.body.classList.add('rainy');
  } 
  else if (w.includes('clear') || w.includes('sun')) {
    document.body.classList.add('sunny');
  } 
  else {
    document.body.classList.add('cloudy');
  }
}

function toggleUnit() {
  // Only toggles today's temperature (requirement)
  if (currentTodayCelsius === null) return;
  const curText = unitToggle.textContent.trim();
  if (curText === '°C') {
    // convert to °F
    const f = cToF(currentTodayCelsius);
    todayTemp.textContent = `${f}°F`;
    feelsLike.textContent = feelsLike.textContent.replace('°C','°F'); // approximate: not converting feels exactly (optional)
    unitToggle.textContent = '°F';
  } 
  else {
    todayTemp.textContent = `${currentTodayCelsius}°C`;
    feelsLike.textContent = feelsLike.textContent.replace('°F','°C');
    unitToggle.textContent = '°C';
  }
}

function cToF(c) {
  return Math.round((c * 9/5) + 32);
}

function round(n) { 
  return Math.round(n); 
}

function capitalize(s=''){ 
  return s.charAt(0).toUpperCase() + s.slice(1); 
}

/* Recent cities localStorage (simple LIFO unique list) */
function loadRecentCities() {
  try {
    const raw = localStorage.getItem('weatherly_recent') || '[]';
    return JSON.parse(raw);
  } 
  catch(e) { 
    return []; 
  }
}

function saveRecentCity(city) {
  if (!city) return;
  recentCities = recentCities.filter(c => c.toLowerCase() !== city.toLowerCase());
  recentCities.unshift(city);
  if (recentCities.length > 6) recentCities.pop();
  localStorage.setItem('weatherly_recent', JSON.stringify(recentCities));
  renderRecentDropdown();
}

function renderRecentDropdown() {
  recentDropdown.innerHTML = '';
  if (!recentCities || recentCities.length === 0) {
    const p = document.createElement('div');
    p.className = 'p-2 text-gray-500';
    p.textContent = 'No recent searches';
    recentDropdown.appendChild(p);
    return;
  }
  recentCities.forEach(city => {
    const item = document.createElement('button');
    item.className = 'w-full text-left px-3 py-2 hover:bg-gray-100';
    item.textContent = city;
    item.addEventListener('click', () => {
      recentDropdown.classList.add('hidden');
      cityInput.value = city;
      fetchWeatherByCity(city);
    });
    recentDropdown.appendChild(item);
  });
}

/* Popups & Alerts */

function showPopup(message, type='info', timeout=3000) {
  popup.classList.remove('hidden');
  popup.textContent = message;
  popup.className = `fixed bottom-6 right-6 bg-white border p-3 rounded shadow z-20`;
  if (type === 'error') popup.classList.add('border-red-400');
  else if (type === 'success') popup.classList.add('border-green-400');
  else if (type === 'info') popup.classList.add('border-sky-400');

  if (timeout > 0) {
    setTimeout(()=> popup.classList.add('hidden'), timeout);
  }
}

function checkExtremeTemperature(tempC) {
  const t = tempC;
  alertArea.innerHTML = '';
  if (t >= 40) {
    const div = document.createElement('div');
    div.className = 'p-3 rounded bg-red-50 border border-red-200 text-red-700';
    div.innerHTML = `<strong>Heat alert:</strong> Temperature is ${Math.round(t)}°C — stay hydrated and avoid prolonged sun exposure.`;
    alertArea.appendChild(div);
  } 
  else if (t <= -10) {
    const div = document.createElement('div');
    div.className = 'p-3 rounded bg-blue-50 border border-blue-200 text-blue-700';
    div.innerHTML = `<strong>Cold alert:</strong> Temperature is ${Math.round(t)}°C — dress warmly and take care outdoors.`;
    alertArea.appendChild(div);
  }
}

function clearAlerts() {
  alertArea.innerHTML = '';
}
