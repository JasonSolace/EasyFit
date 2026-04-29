import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  BarChart3,
  CalendarDays,
  Camera,
  ChevronLeft,
  ChevronRight,
  Download,
  Menu,
  Plus,
  ScanBarcode,
  Trash2,
  Utensils,
  Weight,
  X
} from 'lucide-react';
import './styles.css';

const STORAGE_KEY = 'plate-planner-data-v1';
const PRODUCT_CACHE_KEY = 'plate-planner-product-cache-v1';
const BARCODE_PROVIDERS = [
  {
    id: 'open-food-facts',
    label: 'Open Food Facts',
    lookup: lookupOpenFoodFacts
  }
];

const ENTRY_TYPES = ['breakfast', 'lunch', 'dinner', 'snack', 'drink', 'craving', 'workout', 'other'];
const MAIN_MEALS = ['breakfast', 'lunch', 'dinner'];
const PORTIONS = ['small', 'normal', 'large', 'extra large'];
const WORKOUT_TYPES = ['strength', 'run / walk', 'cardio', 'mixed', 'mobility', 'other'];

const emptyData = {
  days: {},
  workoutTemplates: [],
  foodTemplates: []
};

function todayKey() {
  return toDateKey(new Date());
}

function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function fromDateKey(key) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function startOfWeek(date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date, amount) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + amount);
  return copy;
}

function formatDay(key) {
  return fromDateKey(key).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });
}

function formatMonth(date) {
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function formatTime12(time) {
  if (!time) return '';
  const [hourText, minuteText = '00'] = time.split(':');
  const hour = Number(hourText);
  if (!Number.isFinite(hour)) return time;
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minuteText.padStart(2, '0')} ${period}`;
}

function getTimeParts(time) {
  const [hourText, minuteText = '00'] = (time || '12:00').split(':');
  const hour24 = Number(hourText);
  const minute = Number(minuteText);
  const safeHour = Number.isFinite(hour24) ? hour24 : 12;
  return {
    hour: String(safeHour % 12 || 12),
    minute: String(Number.isFinite(minute) ? minute : 0).padStart(2, '0'),
    period: safeHour >= 12 ? 'PM' : 'AM'
  };
}

function toStoredTime(hourText, minuteText, period) {
  let hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isFinite(hour) || hour < 1 || hour > 12) hour = 12;
  const safeMinute = Number.isFinite(minute) && minute >= 0 && minute <= 59 ? minute : 0;
  if (period === 'AM' && hour === 12) hour = 0;
  if (period === 'PM' && hour !== 12) hour += 12;
  return `${String(hour).padStart(2, '0')}:${String(safeMinute).padStart(2, '0')}`;
}

function isFutureDateKey(dateKey) {
  return dateKey > todayKey();
}

function canEditDateKey(dateKey) {
  return dateKey <= todayKey();
}

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getDay(data, dateKey) {
  return data.days[dateKey] || {
    weight: '',
    entries: []
  };
}

function numberOrNull(value) {
  if (value === '' || value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanEntry(form) {
  const type = form.type === 'activity' ? 'workout' : form.type;
  const base = {
    id: form.id || crypto.randomUUID(),
    time: form.time || '',
    type,
    description: form.description.trim(),
    portion: form.portion,
    portionNote: form.portionNote.trim(),
    calories: numberOrNull(form.calories),
    protein: numberOrNull(form.protein),
    carbs: numberOrNull(form.carbs),
    fat: numberOrNull(form.fat),
    sugar: numberOrNull(form.sugar),
    brand: form.brand.trim(),
    servingSize: form.servingSize.trim(),
    notes: form.notes.trim(),
    photo: form.photo || '',
    barcode: form.barcode.trim(),
    importedFrom: form.importedFrom || ''
  };

  if (type === 'craving') {
    return {
      ...base,
      intensity: Number(form.intensity || 3),
      moodStress: form.moodStress,
      cravingOutcome: form.cravingOutcome
    };
  }

  if (type === 'workout') {
    return {
      ...base,
      portion: '',
      portionNote: '',
      calories: null,
      protein: null,
      carbs: null,
      fat: null,
      sugar: null,
      brand: '',
      servingSize: '',
      barcode: '',
      importedFrom: '',
      workoutType: form.workoutType,
      distanceMiles: numberOrNull(form.distanceMiles),
      durationMinutes: numberOrNull(form.durationMinutes),
      effort: Number(form.effort || 3),
      exercises: form.exercises
        .filter((exercise) => exercise.name.trim())
        .map((exercise) => ({
          id: exercise.id || crypto.randomUUID(),
          name: exercise.name.trim(),
          sets: numberOrNull(exercise.sets),
          reps: numberOrNull(exercise.reps),
          weight: numberOrNull(exercise.weight),
          unit: exercise.unit || 'lb',
          notes: exercise.notes.trim()
        }))
    };
  }

  return base;
}

function newEntryForm(type = 'breakfast') {
  const now = new Date();
  const normalizedType = type === 'activity' ? 'workout' : type;
  return {
    id: '',
    time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    type: normalizedType,
    description: '',
    portion: 'normal',
    portionNote: '',
    calories: '',
    protein: '',
    carbs: '',
    fat: '',
    sugar: '',
    brand: '',
    servingSize: '',
    notes: '',
    photo: '',
    barcode: '',
    importedFrom: '',
    intensity: 3,
    moodStress: 'medium',
    cravingOutcome: 'resisted',
    workoutType: 'strength',
    distanceMiles: '',
    durationMinutes: '',
    effort: 3,
    exercises: []
  };
}

function entryToForm(entry) {
  return {
    ...newEntryForm(entry.type === 'activity' ? 'workout' : entry.type),
    ...entry,
    type: entry.type === 'activity' ? 'workout' : entry.type,
    calories: entry.calories ?? '',
    protein: entry.protein ?? '',
    carbs: entry.carbs ?? '',
    fat: entry.fat ?? '',
    sugar: entry.sugar ?? '',
    distanceMiles: entry.distanceMiles ?? '',
    durationMinutes: entry.durationMinutes ?? '',
    exercises: entry.exercises ?? []
  };
}

function makeWorkoutTemplate(entry) {
  if (entry.type !== 'workout' || !entry.description?.trim()) return null;
  return {
    id: entry.description.trim().toLowerCase(),
    name: entry.description.trim(),
    workoutType: entry.workoutType || 'strength',
    distanceMiles: entry.distanceMiles ?? '',
    durationMinutes: entry.durationMinutes ?? '',
    effort: entry.effort || 3,
    exercises: (entry.exercises || []).map((exercise) => ({
      id: crypto.randomUUID(),
      name: exercise.name,
      sets: exercise.sets ?? '',
      reps: exercise.reps ?? '',
      weight: '',
      unit: exercise.unit || 'lb',
      notes: exercise.notes || ''
    }))
  };
}

function applyWorkoutTemplate(form, template) {
  return {
    ...form,
    description: template.name,
    workoutType: template.workoutType,
    distanceMiles: template.distanceMiles ?? '',
    durationMinutes: template.durationMinutes ?? '',
    effort: template.effort || form.effort,
    exercises: (template.exercises || []).map((exercise) => ({
      ...exercise,
      id: crypto.randomUUID(),
      weight: ''
    }))
  };
}

function makeFoodTemplate(entry) {
  if (['craving', 'workout', 'activity'].includes(entry.type) || !entry.description?.trim()) return null;
  return {
    id: `${entry.type}:${entry.description.trim().toLowerCase()}`,
    type: entry.type,
    name: entry.description.trim(),
    portion: entry.portion || 'normal',
    portionNote: entry.portionNote || '',
    calories: entry.calories ?? '',
    protein: entry.protein ?? '',
    carbs: entry.carbs ?? '',
    fat: entry.fat ?? '',
    sugar: entry.sugar ?? '',
    brand: entry.brand || '',
    servingSize: entry.servingSize || '',
    notes: entry.notes || '',
    barcode: entry.barcode || '',
    importedFrom: entry.importedFrom || ''
  };
}

function applyFoodTemplate(form, template) {
  return {
    ...form,
    description: template.name,
    portion: template.portion || form.portion,
    portionNote: template.portionNote || '',
    calories: template.calories ?? '',
    protein: template.protein ?? '',
    carbs: template.carbs ?? '',
    fat: template.fat ?? '',
    sugar: template.sugar ?? '',
    brand: template.brand || '',
    servingSize: template.servingSize || '',
    notes: template.notes || '',
    barcode: template.barcode || '',
    importedFrom: template.importedFrom || ''
  };
}

function timeBucket(time) {
  if (!time) return 'unknown';
  const hour = Number(time.split(':')[0]);
  if (!Number.isFinite(hour)) return 'unknown';
  if (hour < 10) return 'morning';
  if (hour < 14) return 'midday';
  if (hour < 17) return 'afternoon';
  if (hour < 20) return 'evening';
  return 'after 8 PM';
}

function sumOptional(entries, field) {
  return entries.reduce((total, entry) => total + (Number(entry[field]) || 0), 0);
}

function getWeekKeys(dateKey) {
  const start = startOfWeek(fromDateKey(dateKey));
  return Array.from({ length: 7 }, (_, index) => toDateKey(addDays(start, index)));
}

function analyzeWeek(data, selectedDate) {
  const keys = getWeekKeys(selectedDate);
  const days = keys.map((key) => ({ key, day: getDay(data, key) }));
  const entries = days.flatMap(({ key, day }) => day.entries.map((entry) => ({ ...entry, dateKey: key })));
  const weights = days.map(({ day }) => Number(day.weight)).filter((value) => Number.isFinite(value) && value > 0);
  const avgWeight = weights.length ? weights.reduce((a, b) => a + b, 0) / weights.length : null;
  const mainMeals = entries.filter((entry) => MAIN_MEALS.includes(entry.type));
  const snacks = entries.filter((entry) => entry.type === 'snack');
  const cravings = entries.filter((entry) => entry.type === 'craving');
  const workouts = entries.filter((entry) => entry.type === 'workout' || entry.type === 'activity');
  const bucketCounts = [...snacks, ...cravings].reduce((acc, entry) => {
    const bucket = timeBucket(entry.time);
    acc[bucket] = (acc[bucket] || 0) + 1;
    return acc;
  }, {});
  const commonTimes = Object.entries(bucketCounts).sort((a, b) => b[1] - a[1]);
  const incompleteDays = days
    .filter(({ day }) => MAIN_MEALS.some((meal) => !day.entries.some((entry) => entry.type === meal)))
    .map(({ key }) => key);
  const largeMeals = mainMeals.filter((entry) => entry.portion === 'large' || entry.portion === 'extra large');
  const highStressCravings = cravings.filter((entry) => entry.moodStress === 'high');

  return {
    keys,
    entries,
    avgWeight,
    weights,
    mainMeals,
    snacks,
    cravings,
    workouts,
    commonTimes,
    incompleteDays,
    largeMeals,
    highStressCravings,
    calories: sumOptional(entries, 'calories'),
    protein: sumOptional(entries, 'protein'),
    carbs: sumOptional(entries, 'carbs'),
    fat: sumOptional(entries, 'fat'),
    sugar: sumOptional(entries, 'sugar')
  };
}

function App() {
  const [data, setData] = React.useState(() => loadJson(STORAGE_KEY, emptyData));
  const [selectedDate, setSelectedDate] = React.useState(todayKey());
  const [visibleMonth, setVisibleMonth] = React.useState(() => fromDateKey(todayKey()));
  const [view, setView] = React.useState('day');
  const [editingEntry, setEditingEntry] = React.useState(null);
  const [entryForm, setEntryForm] = React.useState(() => newEntryForm());
  const [isEntryModalOpen, setIsEntryModalOpen] = React.useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);
  const day = getDay(data, selectedDate);
  const workoutTemplates = data.workoutTemplates || [];
  const foodTemplates = data.foodTemplates || [];
  const canEditSelectedDay = canEditDateKey(selectedDate);

  React.useEffect(() => {
    saveJson(STORAGE_KEY, data);
  }, [data]);

  function updateDay(dateKey, updater) {
    setData((current) => {
      const nextDay = updater(getDay(current, dateKey));
      return {
        ...current,
        days: {
          ...current.days,
          [dateKey]: nextDay
        }
      };
    });
  }

  function saveEntry(event) {
    event.preventDefault();
    if (!canEditSelectedDay) return;
    if (!entryForm.description.trim()) return;
    const saved = cleanEntry(entryForm);
    cacheProductFromEntry(saved);
    updateDay(selectedDate, (currentDay) => {
      const exists = currentDay.entries.some((entry) => entry.id === saved.id);
      const entries = exists
        ? currentDay.entries.map((entry) => (entry.id === saved.id ? saved : entry))
        : [...currentDay.entries, saved];
      return {
        ...currentDay,
        entries: entries.sort((a, b) => (a.time || '').localeCompare(b.time || ''))
      };
    });
    upsertWorkoutTemplate(saved);
    upsertFoodTemplate(saved);
    setEntryForm(newEntryForm(saved.type));
    setEditingEntry(null);
    setIsEntryModalOpen(false);
  }

  function upsertWorkoutTemplate(entry) {
    const template = makeWorkoutTemplate(entry);
    if (!template) return;
    setData((current) => {
      const templates = current.workoutTemplates || [];
      const existingIndex = templates.findIndex((item) => item.id === template.id);
      const nextTemplates =
        existingIndex >= 0
          ? templates.map((item, index) => (index === existingIndex ? template : item))
          : [...templates, template];
      return {
        ...current,
        workoutTemplates: nextTemplates.sort((a, b) => a.name.localeCompare(b.name))
      };
    });
  }

  function upsertFoodTemplate(entry) {
    const template = makeFoodTemplate(entry);
    if (!template) return;
    setData((current) => {
      const templates = current.foodTemplates || [];
      const existingIndex = templates.findIndex((item) => item.id === template.id);
      const nextTemplates =
        existingIndex >= 0
          ? templates.map((item, index) => (index === existingIndex ? template : item))
          : [...templates, template];
      return {
        ...current,
        foodTemplates: nextTemplates.sort((a, b) => a.name.localeCompare(b.name))
      };
    });
  }

  function editEntry(entry) {
    if (!canEditSelectedDay) return;
    setEditingEntry(entry.id);
    setEntryForm(entryToForm(entry));
    setIsEntryModalOpen(true);
    setView('day');
  }

  function deleteEntry(entryId) {
    if (!canEditSelectedDay) return;
    updateDay(selectedDate, (currentDay) => ({
      ...currentDay,
      entries: currentDay.entries.filter((entry) => entry.id !== entryId)
    }));
    if (editingEntry === entryId) {
      setEditingEntry(null);
      setEntryForm(newEntryForm());
      setIsEntryModalOpen(false);
    }
  }

  function setDayField(field, value) {
    if (!canEditSelectedDay) return;
    updateDay(selectedDate, (currentDay) => ({ ...currentDay, [field]: value }));
  }

  function startNewEntry(type) {
    if (!canEditSelectedDay) return;
    setEditingEntry(null);
    setEntryForm(newEntryForm(type));
    setIsEntryModalOpen(true);
    setView('day');
  }

  function closeEntryModal() {
    setIsEntryModalOpen(false);
    setEditingEntry(null);
  }

  function importProduct(product) {
    setEntryForm((form) => ({
      ...form,
      description: product.productName || form.description,
      brand: product.brand || form.brand,
      servingSize: product.servingSize || form.servingSize,
      calories: product.calories ?? form.calories,
      protein: product.protein ?? form.protein,
      carbs: product.carbs ?? form.carbs,
      fat: product.fat ?? form.fat,
      sugar: product.sugar ?? form.sugar,
      barcode: product.barcode || form.barcode,
      importedFrom: product.source || form.importedFrom
    }));
  }

  function exportData(kind) {
    const filename = `plate-planner-${todayKey()}.${kind}`;
    const text = kind === 'json' ? JSON.stringify(data, null, 2) : toCsv(data);
    const blob = new Blob([text], { type: kind === 'json' ? 'application/json' : 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Plate Planner</p>
          <h1>Food log for awareness and consistency</h1>
        </div>
        <SettingsMenu
          isOpen={isSettingsOpen}
          onToggle={() => setIsSettingsOpen((open) => !open)}
          onExport={(kind) => {
            exportData(kind);
            setIsSettingsOpen(false);
          }}
        />
      </header>

      <section className="layout">
        <aside className="sidebar">
          <Calendar
            data={data}
            selectedDate={selectedDate}
            visibleMonth={visibleMonth}
            onMonthChange={setVisibleMonth}
            onSelect={(key) => {
              if (isFutureDateKey(key)) return;
              setSelectedDate(key);
              setIsEntryModalOpen(false);
              setEditingEntry(null);
              setView('day');
            }}
          />
          <WeekTrend data={data} selectedDate={selectedDate} />
          <div className="side-actions">
            <button className={view === 'day' ? 'tab active' : 'tab'} onClick={() => setView('day')}>
              <Utensils size={17} />
              Daily log
            </button>
            <button className={view === 'review' ? 'tab active' : 'tab'} onClick={() => setView('review')}>
              <BarChart3 size={17} />
              Weekly review
            </button>
          </div>
        </aside>

        {view === 'day' && (
          <DailyView
            dateKey={selectedDate}
            day={day}
            entryForm={entryForm}
            editingEntry={editingEntry}
            isEntryModalOpen={isEntryModalOpen}
            canEditDay={canEditSelectedDay}
            workoutTemplates={workoutTemplates}
            foodTemplates={foodTemplates}
            onEntryFormChange={setEntryForm}
            onSaveEntry={saveEntry}
            onEditEntry={editEntry}
            onDeleteEntry={deleteEntry}
            onDayField={setDayField}
            onStartNewEntry={startNewEntry}
            onCloseEntryModal={closeEntryModal}
            onImportProduct={importProduct}
          />
        )}

        {view === 'review' && <WeeklyReview data={data} selectedDate={selectedDate} />}
      </section>
    </main>
  );
}

function SettingsMenu({ isOpen, onToggle, onExport }) {
  const lastTouchToggleAtRef = React.useRef(0);

  function handlePointerDown(event) {
    if (event.pointerType === 'touch' || event.pointerType === 'pen') {
      event.preventDefault();
      lastTouchToggleAtRef.current = performance.now();
      onToggle();
    }
  }

  function handleClick() {
    if (performance.now() - lastTouchToggleAtRef.current < 450) {
      return;
    }

    onToggle();
  }

  return (
    <div className="settings-menu">
      <button
        type="button"
        className="icon-only"
        title="Settings"
        aria-expanded={isOpen}
        aria-label={isOpen ? 'Close settings' : 'Open settings'}
        onPointerDown={handlePointerDown}
        onClick={handleClick}
      >
        {isOpen ? <X size={18} /> : <Menu size={18} />}
      </button>
      {isOpen && (
        <div className="settings-popover">
          <div>
            <p className="eyebrow">Settings</p>
            <h2>Data</h2>
          </div>
          <button onClick={() => onExport('csv')}>
            <Download size={17} />
            Export CSV
          </button>
          <button onClick={() => onExport('json')}>
            <Download size={17} />
            Export JSON
          </button>
          <p>Stored locally in this browser. Barcode products are cached locally after lookup or save.</p>
        </div>
      )}
    </div>
  );
}

function Calendar({ data, selectedDate, visibleMonth, onMonthChange, onSelect }) {
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const first = new Date(year, month, 1);
  const gridStart = addDays(first, -first.getDay());
  const cells = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));

  return (
    <section className="panel calendar-panel">
      <div className="calendar-header">
        <button
          className="icon-only"
          title="Previous month"
          onClick={() => onMonthChange(new Date(year, month - 1, 1))}
        >
          <ChevronLeft size={18} />
        </button>
        <h2>{formatMonth(visibleMonth)}</h2>
        <button
          className="icon-only"
          title="Next month"
          onClick={() => onMonthChange(new Date(year, month + 1, 1))}
        >
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="weekday-grid">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((dayName) => (
          <span key={dayName}>{dayName}</span>
        ))}
      </div>
      <div className="calendar-grid">
        {cells.map((date) => {
          const key = toDateKey(date);
          const day = getDay(data, key);
          const hasEntries = day.entries.length > 0;
          const hasWeight = Boolean(day.weight);
          const isFuture = isFutureDateKey(key);
          return (
            <button
              key={key}
              className={[
                'day-cell',
                date.getMonth() !== month ? 'muted' : '',
                isFuture ? 'future' : '',
                key === selectedDate ? 'selected' : '',
                hasEntries || hasWeight ? 'logged' : ''
              ].join(' ')}
              disabled={isFuture}
              onClick={() => onSelect(key)}
            >
              <span>{date.getDate()}</span>
              <i>{hasEntries ? day.entries.length : hasWeight ? 'w' : ''}</i>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function WeekTrend({ data, selectedDate }) {
  const analysis = analyzeWeek(data, selectedDate);
  const prevStart = addDays(startOfWeek(fromDateKey(selectedDate)), -7);
  const previous = analyzeWeek(data, toDateKey(prevStart));
  const delta =
    analysis.avgWeight != null && previous.avgWeight != null ? analysis.avgWeight - previous.avgWeight : null;

  return (
    <section className="panel trend-panel">
      <div className="metric-row">
        <Weight size={18} />
        <div>
          <span>Weekly average</span>
          <strong>{analysis.avgWeight ? `${analysis.avgWeight.toFixed(1)} lb` : 'No weights yet'}</strong>
        </div>
      </div>
      <p className="muted-text">
        {delta == null
          ? 'Add morning weights to see the trend.'
          : Math.abs(delta) < 0.3
            ? 'About the same as last week.'
            : delta < 0
              ? `${Math.abs(delta).toFixed(1)} lb lower than last week.`
              : `${delta.toFixed(1)} lb higher than last week.`}
      </p>
    </section>
  );
}

function DailyView({
  dateKey,
  day,
  entryForm,
  editingEntry,
  isEntryModalOpen,
  canEditDay,
  workoutTemplates,
  foodTemplates,
  onEntryFormChange,
  onSaveEntry,
  onEditEntry,
  onDeleteEntry,
  onDayField,
  onStartNewEntry,
  onCloseEntryModal,
  onImportProduct
}) {
  const mealsLogged = MAIN_MEALS.filter((meal) => day.entries.some((entry) => entry.type === meal));

  return (
    <section className="content">
      <div className="daily-header">
        <div>
          <p className="eyebrow">{dateKey}</p>
          <h2>{formatDay(dateKey)}</h2>
        </div>
        <button className="icon-button" onClick={() => onStartNewEntry('snack')} disabled={!canEditDay}>
          <Plus size={16} />
          Add entry
        </button>
      </div>

      <section className="panel">
        <div className="section-title">
          <h3>Daily anchors</h3>
          <span>{mealsLogged.length}/3 main meals logged</span>
        </div>
        <div className="meal-progress">
          {MAIN_MEALS.map((meal) => {
            const count = day.entries.filter((entry) => entry.type === meal).length;
            return (
              <button
                key={meal}
                className={mealsLogged.includes(meal) ? 'meal-chip done' : 'meal-chip'}
                onClick={() => onStartNewEntry(meal)}
                disabled={!canEditDay}
              >
                <strong>{meal}</strong>
                <span>{count ? `${count} logged` : 'tap to log'}</span>
              </button>
            );
          })}
        </div>
        <div className="weight-grid">
          <label className="weight-only">
            Morning weight
            <input
              type="number"
              inputMode="decimal"
              value={day.weight}
              onChange={(event) => onDayField('weight', event.target.value)}
              placeholder="optional"
              disabled={!canEditDay}
            />
          </label>
        </div>
      </section>

      {isEntryModalOpen && (
        <div className="modal-backdrop">
          <div className="entry-modal">
            <EntryForm
              form={entryForm}
              editingEntry={editingEntry}
              workoutTemplates={workoutTemplates}
              foodTemplates={foodTemplates}
              onChange={onEntryFormChange}
              onSubmit={onSaveEntry}
              onClose={onCloseEntryModal}
              onImportProduct={onImportProduct}
            />
          </div>
        </div>
      )}

      <EntryList entries={day.entries} canEditDay={canEditDay} onEdit={onEditEntry} onDelete={onDeleteEntry} />
    </section>
  );
}

function TimePicker({ value, onChange }) {
  const parts = getTimeParts(value);
  const hours = Array.from({ length: 12 }, (_, index) => String(index + 1));
  const minutes = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'));

  function update(next) {
    const merged = { ...parts, ...next };
    onChange(toStoredTime(merged.hour, merged.minute, merged.period));
  }

  return (
    <div className="time-picker">
      <select aria-label="Hour" value={parts.hour} onChange={(event) => update({ hour: event.target.value })}>
        {hours.map((hour) => (
          <option key={hour} value={hour}>
            {hour}
          </option>
        ))}
      </select>
      <select aria-label="Minute" value={parts.minute} onChange={(event) => update({ minute: event.target.value })}>
        {minutes.map((minute) => (
          <option key={minute} value={minute}>
            {minute}
          </option>
        ))}
      </select>
      <select aria-label="AM or PM" value={parts.period} onChange={(event) => update({ period: event.target.value })}>
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
}

function EntryForm({ form, editingEntry, workoutTemplates, foodTemplates, onChange, onSubmit, onClose, onImportProduct }) {
  const [showScanner, setShowScanner] = React.useState(false);

  function update(field, value) {
    onChange((current) => ({ ...current, [field]: value }));
  }

  function handleDescriptionChange(value) {
    if (form.type === 'workout') {
      const template = workoutTemplates.find((item) => item.name.toLowerCase() === value.trim().toLowerCase());
      onChange((current) => {
        const next = { ...current, description: value };
        return template ? applyWorkoutTemplate(next, template) : next;
      });
      return;
    }

    if (['craving'].includes(form.type)) {
      update('description', value);
      return;
    }

    const template = foodTemplates.find(
      (item) => item.type === form.type && item.name.toLowerCase() === value.trim().toLowerCase()
    );
    onChange((current) => {
      const next = { ...current, description: value };
      return template ? applyFoodTemplate(next, template) : next;
    });
  }

  async function handlePhoto(file) {
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    update('photo', dataUrl);
  }

  return (
    <section className="panel entry-form-panel">
      <div className="section-title">
        <h3>{editingEntry ? 'Edit entry' : 'Add entry'}</h3>
        <div className="entry-form-title-actions">
          <span>Calories and macros are optional</span>
          <button type="button" className="icon-only" title="Close" onClick={onClose}>
            <X size={17} />
          </button>
        </div>
      </div>
      <form onSubmit={onSubmit} className="entry-form">
        <div className="form-grid">
          <label>
            Time
            <TimePicker value={form.time} onChange={(value) => update('time', value)} />
          </label>
          <label>
            Type
            <select value={form.type} onChange={(event) => update('type', event.target.value)}>
              {ENTRY_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label className="wide">
            {form.type === 'craving' ? 'Craving description' : form.type === 'workout' ? 'Workout name' : 'Description'}
            <input
              list={
                form.type === 'workout'
                  ? 'saved-workouts'
                  : form.type !== 'craving'
                    ? `saved-foods-${form.type}`
                    : undefined
              }
              value={form.description}
              onChange={(event) => handleDescriptionChange(event.target.value)}
              placeholder={
                form.type === 'craving'
                  ? 'chips, sweets, second dinner...'
                  : form.type === 'workout'
                    ? 'upper body, 3 mile run, legs, yoga...'
                    : 'what you ate or drank'
              }
              required
            />
            {form.type === 'workout' && (
              <datalist id="saved-workouts">
                {workoutTemplates.map((template) => (
                  <option key={template.id} value={template.name} />
                ))}
              </datalist>
            )}
            {form.type !== 'workout' && form.type !== 'craving' && (
              <datalist id={`saved-foods-${form.type}`}>
                {foodTemplates
                  .filter((template) => template.type === form.type)
                  .map((template) => (
                    <option key={template.id} value={template.name} />
                  ))}
              </datalist>
            )}
          </label>
          {form.type !== 'craving' && form.type !== 'workout' && (
            <>
              <label>
                Portion
                <select value={form.portion} onChange={(event) => update('portion', event.target.value)}>
                  {PORTIONS.map((portion) => (
                    <option key={portion} value={portion}>
                      {portion}
                    </option>
                  ))}
                </select>
              </label>
              <label className="wide">
                Portion note
                <input
                  value={form.portionNote}
                  onChange={(event) => update('portionNote', event.target.value)}
                  placeholder="one plate, one bowl, half serving, same as last time"
                />
              </label>
            </>
          )}

          {form.type === 'workout' && <WorkoutFields form={form} update={update} />}

          {form.type === 'craving' && (
            <>
              <label>
                Intensity
                <input
                  type="range"
                  min="1"
                  max="5"
                  value={form.intensity}
                  onChange={(event) => update('intensity', event.target.value)}
                />
                <span className="range-value">{form.intensity}/5</span>
              </label>
              <label>
                Mood / stress
                <select value={form.moodStress} onChange={(event) => update('moodStress', event.target.value)}>
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                </select>
              </label>
              <label>
                Outcome
                <select
                  value={form.cravingOutcome}
                  onChange={(event) => update('cravingOutcome', event.target.value)}
                >
                  <option value="resisted">resisted</option>
                  <option value="ate something">ate something</option>
                  <option value="planned snack">planned snack</option>
                </select>
              </label>
            </>
          )}

          {form.type !== 'workout' && (
            <>
              <div className="barcode-row wide">
                <button type="button" className="secondary-button" onClick={() => setShowScanner(true)}>
                  <ScanBarcode size={17} />
                  Scan barcode
                </button>
                <label>
                  Barcode
                  <input value={form.barcode} onChange={(event) => update('barcode', event.target.value)} />
                </label>
              </div>

              <NutritionFields form={form} update={update} />
            </>
          )}

          <label className="wide">
            Notes
            <textarea
              value={form.notes}
              onChange={(event) => update('notes', event.target.value)}
              placeholder="hunger, context, portion comparison, what to adjust next time"
            />
          </label>
          {form.type !== 'workout' && (
            <div className="photo-row wide">
              <label className="file-button">
                <Camera size={17} />
                Portion photo
                <input type="file" accept="image/*" onChange={(event) => handlePhoto(event.target.files?.[0])} />
              </label>
              {form.photo && (
                <div className="photo-preview">
                  <img src={form.photo} alt="Portion preview" />
                  <button type="button" className="icon-only" title="Remove photo" onClick={() => update('photo', '')}>
                    <Trash2 size={16} />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        {form.importedFrom && (
          <p className="notice">
            Imported from {form.importedFrom}. Review and edit the nutrition values before saving.
          </p>
        )}
        <button className="primary-button" type="submit">
          {editingEntry ? 'Save changes' : 'Save entry'}
        </button>
      </form>
      {showScanner && (
        <BarcodeScanner
          onClose={() => setShowScanner(false)}
          onProduct={(product) => {
            onImportProduct(product);
            setShowScanner(false);
          }}
        />
      )}
    </section>
  );
}

function NutritionFields({ form, update }) {
  return (
    <>
      <label>
        Brand
        <input value={form.brand} onChange={(event) => update('brand', event.target.value)} />
      </label>
      <label>
        Serving size
        <input value={form.servingSize} onChange={(event) => update('servingSize', event.target.value)} />
      </label>
      <label>
        Calories
        <input type="number" inputMode="decimal" value={form.calories} onChange={(event) => update('calories', event.target.value)} />
      </label>
      <label>
        Protein
        <input type="number" inputMode="decimal" value={form.protein} onChange={(event) => update('protein', event.target.value)} />
      </label>
      <label>
        Carbs
        <input type="number" inputMode="decimal" value={form.carbs} onChange={(event) => update('carbs', event.target.value)} />
      </label>
      <label>
        Fat
        <input type="number" inputMode="decimal" value={form.fat} onChange={(event) => update('fat', event.target.value)} />
      </label>
      <label>
        Sugar
        <input type="number" inputMode="decimal" value={form.sugar} onChange={(event) => update('sugar', event.target.value)} />
      </label>
    </>
  );
}

function WorkoutFields({ form, update }) {
  const showsDistance = ['run / walk', 'cardio', 'mixed'].includes(form.workoutType);
  const showsExercises = ['strength', 'mixed'].includes(form.workoutType);

  function updateExercise(index, field, value) {
    const exercises = [...form.exercises];
    exercises[index] = { ...exercises[index], [field]: value };
    update('exercises', exercises);
  }

  function addExercise() {
    update('exercises', [
      ...form.exercises,
      {
        id: crypto.randomUUID(),
        name: '',
        sets: '',
        reps: '',
        weight: '',
        unit: 'lb',
        notes: ''
      }
    ]);
  }

  function removeExercise(index) {
    update(
      'exercises',
      form.exercises.filter((_, currentIndex) => currentIndex !== index)
    );
  }

  return (
    <>
      <label>
        Workout type
        <select value={form.workoutType} onChange={(event) => update('workoutType', event.target.value)}>
          {WORKOUT_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </label>
      <label>
        Effort
        <input
          type="range"
          min="1"
          max="5"
          value={form.effort}
          onChange={(event) => update('effort', event.target.value)}
        />
        <span className="range-value">{form.effort}/5</span>
      </label>
      {showsDistance && (
        <>
          <label>
            Distance
            <input
              type="number"
              inputMode="decimal"
              value={form.distanceMiles}
              onChange={(event) => update('distanceMiles', event.target.value)}
              placeholder="miles"
            />
          </label>
          <label>
            Duration
            <input
              type="number"
              inputMode="decimal"
              value={form.durationMinutes}
              onChange={(event) => update('durationMinutes', event.target.value)}
              placeholder="minutes"
            />
          </label>
        </>
      )}
      {showsExercises && (
        <div className="workout-builder wide">
          <div className="section-title">
            <h3>Exercises</h3>
            <button type="button" className="secondary-button" onClick={addExercise}>
              <Plus size={16} />
              Add exercise
            </button>
          </div>
          {form.exercises.length === 0 && (
            <p className="muted-text">Add strength exercises if you want to track sets, reps, and weight.</p>
          )}
          {form.exercises.map((exercise, index) => (
            <div className="exercise-row" key={exercise.id || index}>
              <label>
                Exercise
                <input
                  value={exercise.name}
                  onChange={(event) => updateExercise(index, 'name', event.target.value)}
                  placeholder="bench press, squat, row..."
                />
              </label>
              <label>
                Sets
                <input
                  type="number"
                  inputMode="decimal"
                  value={exercise.sets}
                  onChange={(event) => updateExercise(index, 'sets', event.target.value)}
                />
              </label>
              <label>
                Reps
                <input
                  type="number"
                  inputMode="decimal"
                  value={exercise.reps}
                  onChange={(event) => updateExercise(index, 'reps', event.target.value)}
                />
              </label>
              <label>
                Weight
                <input
                  type="number"
                  inputMode="decimal"
                  value={exercise.weight}
                  onChange={(event) => updateExercise(index, 'weight', event.target.value)}
                />
              </label>
              <label>
                Unit
                <select value={exercise.unit} onChange={(event) => updateExercise(index, 'unit', event.target.value)}>
                  <option value="lb">lb</option>
                  <option value="kg">kg</option>
                </select>
              </label>
              <label className="wide">
                Exercise notes
                <input
                  value={exercise.notes}
                  onChange={(event) => updateExercise(index, 'notes', event.target.value)}
                  placeholder="easy, hard, form note, same as last time..."
                />
              </label>
              <button type="button" className="icon-only exercise-remove" title="Remove exercise" onClick={() => removeExercise(index)}>
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function EntryList({ entries, canEditDay, onEdit, onDelete }) {
  if (!entries.length) {
    return (
      <section className="panel empty-state">
        <CalendarDays size={28} />
        <h3>No entries yet</h3>
        <p>Start with one meal, snack, drink, craving, workout, or weight.</p>
      </section>
    );
  }

  return (
    <section className="entry-list">
      {entries.map((entry) => (
        <article key={entry.id} className={`entry-card type-${entry.type === 'activity' ? 'workout' : entry.type}`}>
          <div className="entry-main">
            <div>
              <div className="entry-meta">
                <span>{formatTime12(entry.time) || 'no time'}</span>
                <strong>{entry.type === 'activity' ? 'workout' : entry.type}</strong>
                {entry.portion && entry.type !== 'craving' && entry.type !== 'workout' && <span>{entry.portion}</span>}
              </div>
              <h3>{entry.description}</h3>
              {entry.type === 'workout' || entry.type === 'activity' ? (
                <WorkoutSummary entry={entry} />
              ) : (
                <p>
                  {[entry.brand, entry.servingSize, entry.portionNote, entry.notes].filter(Boolean).join(' | ') ||
                    'No notes'}
                </p>
              )}
              {entry.type === 'craving' && (
                <p>
                  Intensity {entry.intensity}/5 | stress {entry.moodStress} | {entry.cravingOutcome}
                </p>
              )}
              <NutritionSummary entry={entry} />
            </div>
            {entry.photo && entry.type !== 'workout' && entry.type !== 'activity' && (
              <img className="entry-photo" src={entry.photo} alt={`${entry.description} portion`} />
            )}
          </div>
          {canEditDay && (
            <div className="entry-actions">
              <button onClick={() => onEdit(entry)}>Edit</button>
              <button onClick={() => onDelete(entry.id)}>Delete</button>
            </div>
          )}
        </article>
      ))}
    </section>
  );
}

function WorkoutSummary({ entry }) {
  const stats = [
    entry.workoutType,
    entry.distanceMiles != null ? `${entry.distanceMiles} mi` : '',
    entry.durationMinutes != null ? `${entry.durationMinutes} min` : '',
    entry.effort ? `effort ${entry.effort}/5` : ''
  ].filter(Boolean);

  return (
    <div className="workout-summary">
      <p>{stats.join(' | ') || 'Workout logged'}</p>
      {entry.exercises?.length > 0 && (
        <div className="exercise-summary-list">
          {entry.exercises.map((exercise) => (
            <span key={exercise.id || exercise.name}>
              {exercise.name}
              {exercise.sets || exercise.reps ? `: ${exercise.sets || '-'}x${exercise.reps || '-'}` : ''}
              {exercise.weight ? ` @ ${exercise.weight} ${exercise.unit || 'lb'}` : ''}
            </span>
          ))}
        </div>
      )}
      {entry.notes && <p>{entry.notes}</p>}
    </div>
  );
}

function NutritionSummary({ entry }) {
  const items = [
    entry.calories != null ? `${entry.calories} cal` : '',
    entry.protein != null ? `${entry.protein}g protein` : '',
    entry.carbs != null ? `${entry.carbs}g carbs` : '',
    entry.fat != null ? `${entry.fat}g fat` : '',
    entry.sugar != null ? `${entry.sugar}g sugar` : ''
  ].filter(Boolean);

  if (!items.length) return null;
  return <div className="nutrition-line">{items.join(' | ')}</div>;
}

function WeeklyReview({ data, selectedDate }) {
  const analysis = analyzeWeek(data, selectedDate);
  const previous = analyzeWeek(data, toDateKey(addDays(startOfWeek(fromDateKey(selectedDate)), -7)));
  const suggestions = buildSuggestions(analysis, previous);

  return (
    <section className="content">
      <div className="daily-header">
        <div>
          <p className="eyebrow">Weekly review</p>
          <h2>
            {formatDay(analysis.keys[0])} - {formatDay(analysis.keys[6])}
          </h2>
        </div>
      </div>
      <section className="metrics-grid">
        <Metric label="Average weight" value={analysis.avgWeight ? `${analysis.avgWeight.toFixed(1)} lb` : 'none'} />
        <Metric label="Meals logged" value={analysis.mainMeals.length} />
        <Metric label="Snacks" value={analysis.snacks.length} />
        <Metric label="Cravings" value={analysis.cravings.length} />
        <Metric label="Workouts" value={analysis.workouts.length} />
      </section>
      <section className="panel">
        <div className="section-title">
          <h3>Patterns</h3>
          <span>{analysis.entries.length} total entries</span>
        </div>
        <div className="review-grid">
          <ReviewBlock title="Snack / craving times" value={formatCommonTimes(analysis.commonTimes)} />
          <ReviewBlock title="Incomplete logs" value={analysis.incompleteDays.length ? analysis.incompleteDays.map(formatDay).join(', ') : 'none'} />
          <ReviewBlock title="Large main meals" value={`${analysis.largeMeals.length} logged`} />
          <ReviewBlock title="Optional nutrition" value={formatNutritionTotals(analysis)} />
        </div>
      </section>
      <section className="panel">
        <div className="section-title">
          <h3>Suggestions</h3>
          <span>Non-medical, habit-focused</span>
        </div>
        <div className="suggestion-list">
          {suggestions.map((suggestion) => (
            <p key={suggestion}>{suggestion}</p>
          ))}
        </div>
      </section>
    </section>
  );
}

function Metric({ label, value }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ReviewBlock({ title, value }) {
  return (
    <div className="review-block">
      <span>{title}</span>
      <strong>{value}</strong>
    </div>
  );
}

function buildSuggestions(analysis, previous) {
  const suggestions = [];
  const topTime = analysis.commonTimes[0];
  if (analysis.snacks.length) {
    suggestions.push(
      `You logged snacks ${analysis.snacks.length} times this week${topTime ? `, mostly ${topTime[0]}` : ''}.`
    );
  }
  if (analysis.avgWeight != null && previous.avgWeight != null) {
    const delta = analysis.avgWeight - previous.avgWeight;
    if (Math.abs(delta) < 0.3) {
      suggestions.push('Your weight stayed about the same this week. Consider slightly reducing portions on repeated large meals.');
    } else if (delta < 0) {
      suggestions.push('Your weekly average weight moved down. Keep the habits that felt repeatable.');
    } else {
      suggestions.push('Your weekly average weight moved up. Look for extra snacks, drinks, or repeated large portions before making bigger changes.');
    }
  }
  if (analysis.highStressCravings.length) {
    suggestions.push('You had several cravings during high-stress periods.');
  }
  if (analysis.incompleteDays.length <= 1 && analysis.entries.length >= 10) {
    suggestions.push('Your logs were consistent this week.');
  }
  if (analysis.largeMeals.length >= 4) {
    suggestions.push('Several main meals were marked large or extra large. Compare photos and try one small portion adjustment next week.');
  }
  if (!suggestions.length) {
    suggestions.push('Log a few more meals, snacks, cravings, and weights to generate useful weekly feedback.');
  }
  return suggestions;
}

function formatCommonTimes(commonTimes) {
  if (!commonTimes.length) return 'none yet';
  return commonTimes.slice(0, 2).map(([time, count]) => `${time} (${count})`).join(', ');
}

function formatNutritionTotals(analysis) {
  const totals = [
    analysis.calories ? `${analysis.calories} cal` : '',
    analysis.protein ? `${analysis.protein}g protein` : '',
    analysis.carbs ? `${analysis.carbs}g carbs` : '',
    analysis.fat ? `${analysis.fat}g fat` : ''
  ].filter(Boolean);
  return totals.length ? totals.join(' | ') : 'not entered';
}

function BarcodeScanner({ onClose, onProduct }) {
  const videoRef = React.useRef(null);
  const [status, setStatus] = React.useState('Starting camera...');
  const [manualCode, setManualCode] = React.useState('');
  const [stream, setStream] = React.useState(null);
  const [isLookingUp, setIsLookingUp] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    let frameId = 0;
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('Camera access is not available in this browser. Enter the barcode manually.');
        return;
      }
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false
        });
        if (cancelled) {
          mediaStream.getTracks().forEach((track) => track.stop());
          return;
        }
        setStream(mediaStream);
        videoRef.current.srcObject = mediaStream;
        await videoRef.current.play();

        if (!('BarcodeDetector' in window)) {
          setStatus('Live scanning is not supported in this browser. Enter the barcode manually.');
          return;
        }

        const detector = new window.BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e']
        });
        setStatus('Point the camera at a UPC or EAN barcode.');
        const scan = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes.length) {
              await lookup(codes[0].rawValue);
              return;
            }
          } catch {
            setStatus('Scanning paused. Try manual entry if the code is not detected.');
          }
          frameId = requestAnimationFrame(scan);
        };
        frameId = requestAnimationFrame(scan);
      } catch {
        setStatus('Camera permission was blocked or unavailable. Enter the barcode manually.');
      }
    }
    start();
    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
    };
  }, []);

  React.useEffect(() => {
    return () => {
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [stream]);

  async function lookup(code) {
    if (!code || isLookingUp) return;
    setIsLookingUp(true);
    setStatus(`Looking up ${code}...`);
    const product = await lookupBarcode(code);
    setIsLookingUp(false);
    if (product) {
      onProduct(product);
    } else {
      setStatus('No product found. You can save this barcode with a manual entry.');
      setManualCode(code);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="scanner-modal">
        <div className="section-title">
          <h3>Barcode scan</h3>
          <button onClick={onClose}>Close</button>
        </div>
        <video ref={videoRef} playsInline muted />
        <p className="notice">{status}</p>
        <form
          className="manual-barcode"
          onSubmit={(event) => {
            event.preventDefault();
            lookup(manualCode);
          }}
        >
          <input value={manualCode} onChange={(event) => setManualCode(event.target.value)} placeholder="Enter UPC/EAN" />
          <button type="submit">Lookup</button>
          <button
            type="button"
            onClick={() =>
              onProduct({
                barcode: manualCode,
                source: 'local manual barcode'
              })
            }
          >
            Use manually
          </button>
        </form>
      </div>
    </div>
  );
}

async function lookupBarcode(code) {
  const cache = loadJson(PRODUCT_CACHE_KEY, {});
  if (cache[code]) return cache[code];

  for (const provider of BARCODE_PROVIDERS) {
    const product = await provider.lookup(code);
    if (product) {
      const normalized = { ...product, source: provider.label };
      saveJson(PRODUCT_CACHE_KEY, { ...cache, [code]: normalized });
      return normalized;
    }
  }

  return null;
}

async function lookupOpenFoodFacts(code) {
  try {
    const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`);
    if (!response.ok) return null;
    const payload = await response.json();
    if (payload.status !== 1 || !payload.product) return null;
    const product = payload.product;
    const nutriments = product.nutriments || {};
    const normalized = {
      barcode: code,
      productName: product.product_name || product.generic_name || '',
      brand: product.brands || '',
      servingSize: product.serving_size || '',
      calories: nutriments['energy-kcal_serving'] ?? nutriments['energy-kcal_100g'] ?? '',
      protein: nutriments.proteins_serving ?? nutriments.proteins_100g ?? '',
      carbs: nutriments.carbohydrates_serving ?? nutriments.carbohydrates_100g ?? '',
      fat: nutriments.fat_serving ?? nutriments.fat_100g ?? '',
      sugar: nutriments.sugars_serving ?? nutriments.sugars_100g ?? ''
    };
    return normalized;
  } catch {
    return null;
  }
}

function cacheProductFromEntry(entry) {
  if (!entry.barcode) return;
  const cache = loadJson(PRODUCT_CACHE_KEY, {});
  saveJson(PRODUCT_CACHE_KEY, {
    ...cache,
    [entry.barcode]: {
      barcode: entry.barcode,
      source: entry.importedFrom || 'local saved barcode',
      productName: entry.description,
      brand: entry.brand,
      servingSize: entry.servingSize,
      calories: entry.calories ?? '',
      protein: entry.protein ?? '',
      carbs: entry.carbs ?? '',
      fat: entry.fat ?? '',
      sugar: entry.sugar ?? ''
    }
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function toCsv(data) {
  const headers = [
    'date',
    'weight',
    'time',
    'type',
    'description',
    'portion',
    'portion_note',
    'calories',
    'protein',
    'carbs',
    'fat',
    'sugar',
    'brand',
    'serving_size',
    'barcode',
    'intensity',
    'mood_stress',
    'craving_outcome',
    'workout_type',
    'distance_miles',
    'duration_minutes',
    'effort',
    'exercises',
    'notes',
    'has_photo'
  ];
  const rows = [headers];
  Object.entries(data.days).forEach(([dateKey, day]) => {
    if (!day.entries.length) {
      rows.push([dateKey, day.weight, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    }
    day.entries.forEach((entry) => {
      rows.push([
        dateKey,
        day.weight,
        entry.time,
        entry.type,
        entry.description,
        entry.portion,
        entry.portionNote,
        entry.calories,
        entry.protein,
        entry.carbs,
        entry.fat,
        entry.sugar,
        entry.brand,
        entry.servingSize,
        entry.barcode,
        entry.intensity,
        entry.moodStress,
        entry.cravingOutcome,
        entry.workoutType,
        entry.distanceMiles,
        entry.durationMinutes,
        entry.effort,
        formatExercisesCsv(entry.exercises),
        entry.notes,
        entry.photo ? 'yes' : 'no'
      ]);
    });
  });
  return rows.map((row) => row.map(csvEscape).join(',')).join('\n');
}

function formatExercisesCsv(exercises = []) {
  return exercises
    .map((exercise) => {
      const performance = [
        exercise.sets || exercise.reps ? `${exercise.sets || '-'}x${exercise.reps || '-'}` : '',
        exercise.weight ? `${exercise.weight} ${exercise.unit || 'lb'}` : ''
      ]
        .filter(Boolean)
        .join(' @ ');
      return [exercise.name, performance, exercise.notes].filter(Boolean).join(' ');
    })
    .join('; ');
}

function csvEscape(value) {
  const text = value == null ? '' : String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

createRoot(document.getElementById('root')).render(<App />);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch(() => {
      // The app still works without offline caching.
    });
  });
}
