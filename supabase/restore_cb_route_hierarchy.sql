-- Cafe Barra route hierarchy: 3 parent routes + 10 legs (plain English)
-- Scope: company 58b2b15b-bada-4bcd-9c12-b7e66a37d0bc ONLY. Parents stay level='route' (hasHierarchy holds).
BEGIN;

-- 1. create the 3 parent routes (user_id pulled from an existing CB route)
INSERT INTO public.routes (id, company_id, user_id, category, title, short_description, level, sort_order)
SELECT 'a1a10001-0000-4cb0-9000-000000000001', '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc', user_id, 'fix', 'Make daily operations reliable', 'The everyday basics — ordering, stock, pricing, and prep — running smoothly so nothing falls over.', 'route', 1
FROM public.routes WHERE company_id='58b2b15b-bada-4bcd-9c12-b7e66a37d0bc' LIMIT 1;
INSERT INTO public.routes (id, company_id, user_id, category, title, short_description, level, sort_order)
SELECT 'a1a10002-0000-4cb0-9000-000000000002', '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc', user_id, 'create', 'Prove the coffee is as good as we say', 'Back up the quality claim with proof partners can see and trust, instead of asking them to take it on faith.', 'route', 2
FROM public.routes WHERE company_id='58b2b15b-bada-4bcd-9c12-b7e66a37d0bc' LIMIT 1;
INSERT INTO public.routes (id, company_id, user_id, category, title, short_description, level, sort_order)
SELECT 'a1a10003-0000-4cb0-9000-000000000003', '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc', user_id, 'improve', 'Make the Barra Process easy to see and share', 'Turn the roasting method from something in your head into something you can show, teach, and hand to a partner.', 'route', 3
FROM public.routes WHERE company_id='58b2b15b-bada-4bcd-9c12-b7e66a37d0bc' LIMIT 1;

-- 2. demote the 10 existing routes to legs, reparent + plain-English copy (pts/steps preserved)
UPDATE public.routes SET level='leg', parent_id='a1a10001-0000-4cb0-9000-000000000001', sort_order=1, title='Write down clear supplier terms so reordering is easy', short_description='Lead times and prices from suppliers aren''t written down clearly, which makes reordering harder and can lead to running out.' WHERE id='f0fac021-4944-4f9e-a296-3e9f8833486f';
UPDATE public.routes SET level='leg', parent_id='a1a10002-0000-4cb0-9000-000000000002', sort_order=1, title='See if proof of reliability makes partners reorder more confidently', short_description='Most proof of reliability lives in public reviews; this checks whether giving partners direct, documented proof makes them more confident to keep ordering.' WHERE id='49318645-d804-4c83-b7fe-e5cbe01a607e';
UPDATE public.routes SET level='leg', parent_id='a1a10002-0000-4cb0-9000-000000000002', sort_order=2, title='Give partner cafes a simple way to see the quality stays consistent', short_description='Partners currently take quality on faith; give them something concrete, like a roast log or tasting comparison, so they can see it for themselves.' WHERE id='e1000001-cafe-4bcd-9012-cafe79000001';
UPDATE public.routes SET level='leg', parent_id='a1a10003-0000-4cb0-9000-000000000003', sort_order=3, title='Add a few quick screening questions before the full partner interview', short_description='The full interview is thorough but it''s the only filter; a few quick questions up front screen out obvious mismatches early.' WHERE id='e2000001-cafe-4bcd-9012-cafe79000001';
UPDATE public.routes SET level='leg', parent_id='a1a10003-0000-4cb0-9000-000000000003', sort_order=1, title='Turn one roasting recipe into clear steps anyone can follow', short_description='The Barra Process lives in instinct and notes; write one recipe as clear steps so someone else could follow it and get the same result.' WHERE id='e3000001-cafe-4bcd-9012-cafe79000001';
UPDATE public.routes SET level='leg', parent_id='a1a10003-0000-4cb0-9000-000000000003', sort_order=2, title='Explain seasonal bean changes so partners see them as a feature, not a problem', short_description='Beans change by season on purpose, but partners can read that as an unexplained problem; a short heads-up turns it into something they value.' WHERE id='e4000001-cafe-4bcd-9012-cafe79000001';
UPDATE public.routes SET level='leg', parent_id='a1a10002-0000-4cb0-9000-000000000002', sort_order=3, title='Compare the coffee directly against top competitors to see if the claim holds', short_description='The claim that it''s a step above the rest is asserted, not shown; put it head-to-head with the premium options a partner already buys.' WHERE id='e5000001-cafe-4bcd-9012-cafe79000001';
UPDATE public.routes SET level='leg', parent_id='a1a10001-0000-4cb0-9000-000000000001', sort_order=3, title='Know the real cost and margin before changing prices', short_description='Prices were set ad-hoc without a clear view of cost and profit, so problems only show up later in the numbers.' WHERE id='ecf0b2e3-b5ec-4bb6-9327-e801071b110b';
UPDATE public.routes SET level='leg', parent_id='a1a10001-0000-4cb0-9000-000000000001', sort_order=4, title='Keep prep quality consistent without relying on the manager', short_description='Prep quality depends on the manager being there; writing down how it''s done keeps it steady no matter who''s working.' WHERE id='111d3d7f-22b4-4fcb-9b8f-c5dd9219e670';
UPDATE public.routes SET level='leg', parent_id='a1a10001-0000-4cb0-9000-000000000001', sort_order=2, title='Catch low stock before you run out', short_description='Ordering relies on manual counts, so you often notice you''re low only after you''ve run out; a simple alert catches it sooner.' WHERE id='6dacee4b-af44-415d-be93-7e8b430fd6ca';

COMMIT;

-- verification: 3 routes + 10 legs, tree view
SELECT COALESCE(p.title,r.title) AS parent, CASE WHEN r.level='leg' THEN '   └ '||r.title END AS leg, r.level, r.sort_order
FROM public.routes r LEFT JOIN public.routes p ON r.parent_id=p.id
WHERE r.company_id='58b2b15b-bada-4bcd-9c12-b7e66a37d0bc' ORDER BY COALESCE(p.sort_order,r.sort_order), r.level DESC, r.sort_order;
