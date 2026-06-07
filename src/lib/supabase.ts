import { createClient } from '@supabase/supabase-js';


// Initialize database client
const supabaseUrl = 'https://cvjuxzkznxzxcjkdvzla.databasepad.com';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IjI2NjhmNjM3LWUyZTQtNGFhZi05Mzc4LTY2NDRhNTkyYzhhZSJ9.eyJwcm9qZWN0SWQiOiJjdmp1eHprem54enhjamtkdnpsYSIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzc4MDE5NDg2LCJleHAiOjIwOTMzNzk0ODYsImlzcyI6ImZhbW91cy5kYXRhYmFzZXBhZCIsImF1ZCI6ImZhbW91cy5jbGllbnRzIn0.AicoGenHPsQ1yHMmNZYvbzE05sBHyNjJep2FpNvT4Qk';
const supabase = createClient(supabaseUrl, supabaseKey);


export { supabase };