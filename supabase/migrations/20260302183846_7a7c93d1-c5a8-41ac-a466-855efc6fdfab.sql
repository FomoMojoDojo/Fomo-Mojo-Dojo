
-- Enum for input group
CREATE TYPE public.input_group_key AS ENUM ('foundation', 'execution', 'market_evidence');

-- Enum for input status
CREATE TYPE public.input_status AS ENUM ('complete', 'partial', 'gap', 'not_started');

-- Enum for impact tier
CREATE TYPE public.input_impact_tier AS ENUM ('high', 'med', 'low', 'done');

-- Inputs table
CREATE TABLE public.inputs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  input_key TEXT NOT NULL,
  input_label TEXT NOT NULL,
  group_key input_group_key NOT NULL DEFAULT 'foundation',
  group_label TEXT NOT NULL DEFAULT '',
  sub_group TEXT NOT NULL DEFAULT '',
  completeness INTEGER NOT NULL DEFAULT 0,
  status input_status NOT NULL DEFAULT 'not_started',
  score_impact NUMERIC(5,2) NOT NULL DEFAULT 0,
  impact_tier input_impact_tier NOT NULL DEFAULT 'low',
  description TEXT NOT NULL DEFAULT '',
  why_it_matters TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Input subitems table
CREATE TABLE public.input_subitems (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  input_id UUID REFERENCES public.inputs(id) ON DELETE CASCADE NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT false
);

-- Input files table
CREATE TABLE public.input_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  input_id UUID REFERENCES public.inputs(id) ON DELETE CASCADE NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL DEFAULT '',
  file_path TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.inputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.input_subitems ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.input_files ENABLE ROW LEVEL SECURITY;

-- RLS policies for inputs
CREATE POLICY "Users can view own inputs" ON public.inputs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own inputs" ON public.inputs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own inputs" ON public.inputs FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own inputs" ON public.inputs FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all inputs" ON public.inputs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update all inputs" ON public.inputs FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- RLS policies for subitems (via input ownership)
CREATE POLICY "Users can view own subitems" ON public.input_subitems FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.inputs WHERE inputs.id = input_subitems.input_id AND inputs.user_id = auth.uid()));
CREATE POLICY "Users can insert own subitems" ON public.input_subitems FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.inputs WHERE inputs.id = input_subitems.input_id AND inputs.user_id = auth.uid()));
CREATE POLICY "Users can update own subitems" ON public.input_subitems FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.inputs WHERE inputs.id = input_subitems.input_id AND inputs.user_id = auth.uid()));
CREATE POLICY "Users can delete own subitems" ON public.input_subitems FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.inputs WHERE inputs.id = input_subitems.input_id AND inputs.user_id = auth.uid()));

-- RLS policies for files (via input ownership)
CREATE POLICY "Users can view own files" ON public.input_files FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.inputs WHERE inputs.id = input_files.input_id AND inputs.user_id = auth.uid()));
CREATE POLICY "Users can insert own files" ON public.input_files FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.inputs WHERE inputs.id = input_files.input_id AND inputs.user_id = auth.uid()));
CREATE POLICY "Users can delete own files" ON public.input_files FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.inputs WHERE inputs.id = input_files.input_id AND inputs.user_id = auth.uid()));

-- Storage bucket for input files
INSERT INTO storage.buckets (id, name, public) VALUES ('input-files', 'input-files', false);

-- Storage RLS policies
CREATE POLICY "Users can upload input files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'input-files' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users can view own input files" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'input-files' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users can delete own input files" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'input-files' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Updated_at trigger
CREATE TRIGGER update_inputs_updated_at BEFORE UPDATE ON public.inputs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
