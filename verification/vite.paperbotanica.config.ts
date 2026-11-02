import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
export default defineConfig({ plugins:[react()], build:{outDir:'verification/feature-build',emptyOutDir:true,lib:{entry:path.resolve('src/features/paperbotanica/PaperBotanicaPage.tsx'),name:'PaperBotanicaPreview',formats:['es']},rollupOptions:{external:['react','react/jsx-runtime']}} });
