
-- Create methodology_pages table
CREATE TABLE public.methodology_pages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  page_number TEXT NOT NULL,
  page_title TEXT NOT NULL,
  phase TEXT NOT NULL DEFAULT 'foundation',
  hero_subtitle TEXT NOT NULL DEFAULT '',
  hero_description TEXT NOT NULL DEFAULT '',
  impact_score TEXT NOT NULL DEFAULT '+0',
  score_detail TEXT NOT NULL DEFAULT '',
  process_steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  section1_title TEXT NOT NULL DEFAULT 'What This Is',
  section1_content TEXT NOT NULL DEFAULT '',
  section2_title TEXT NOT NULL DEFAULT 'The Process',
  section2_content TEXT NOT NULL DEFAULT '',
  section3_title TEXT NOT NULL DEFAULT 'What You''ll Get',
  section3_content TEXT NOT NULL DEFAULT '',
  section4_title TEXT NOT NULL DEFAULT 'Why It Matters',
  section4_content TEXT NOT NULL DEFAULT '',
  section5_title TEXT NOT NULL DEFAULT 'What Happens Next',
  section5_content TEXT NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.methodology_pages ENABLE ROW LEVEL SECURITY;

-- Public can read published pages
CREATE POLICY "Anyone can view published pages"
ON public.methodology_pages FOR SELECT
USING (is_published = true);

-- Authenticated admins can do everything (we'll use role check)
-- For now, authenticated users can manage pages (we'll add role-based later)
CREATE POLICY "Authenticated users can insert pages"
ON public.methodology_pages FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update pages"
ON public.methodology_pages FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete pages"
ON public.methodology_pages FOR DELETE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can view all pages"
ON public.methodology_pages FOR SELECT
TO authenticated
USING (true);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_methodology_pages_updated_at
BEFORE UPDATE ON public.methodology_pages
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
ON public.profiles FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

-- Role system
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Users can view own roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (auth.uid() = user_id);
