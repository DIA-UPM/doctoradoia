// Readable JSON field names: "Formación / Actividades formativas" page.
// The activity tables and the schedule table are converted into structured data by
// scripts/import/extract-training.mjs (data/<lang>/training-activities.json).
export default {
  // template finished by hand; data is post-processed by scripts/import/extract-training.mjs
  keepTemplate: true,
  names: {
    phz4e97: 'hero',
    gax4bs3: 'intro',
    zl6mp0a: 'activityTabs',
    bkjbhue: 'schedule',
  },
};
