
-- Add company_id to inputs table
ALTER TABLE public.inputs ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;

-- Add company_id to deep_dive_analyses table  
ALTER TABLE public.deep_dive_analyses ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;

-- Update existing Edgewood inputs to reference the Edgewood company
UPDATE public.inputs SET company_id = '63dc4c0b-4bb6-4b14-9c26-cbc19caf9326' WHERE company_id IS NULL;

-- Update existing deep dives
UPDATE public.deep_dive_analyses SET company_id = '63dc4c0b-4bb6-4b14-9c26-cbc19caf9326' WHERE company_id IS NULL;

-- Create index for faster queries
CREATE INDEX idx_inputs_company_id ON public.inputs(company_id);
CREATE INDEX idx_deep_dive_analyses_company_id ON public.deep_dive_analyses(company_id);
