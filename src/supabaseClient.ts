import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://itfbtsoobnjvqvjdixja.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0ZmJ0c29vYm5qdnF2amRpeGphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0NTAyOTksImV4cCI6MjA4NTAyNjI5OX0.bDmrcHntzRuNP2CXWkVC6pIKTCLfk9QSkymtTN7ZhQ8';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
