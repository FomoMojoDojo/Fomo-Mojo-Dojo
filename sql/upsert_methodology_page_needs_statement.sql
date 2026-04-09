-- Methodology template page:
-- How to Create a Needs Statement
-- Designed as a repeatable workshop format for key areas and future workshop ideas.

insert into public.methodology_pages (
  slug,
  page_number,
  page_title,
  phase,
  hero_subtitle,
  hero_description,
  impact_score,
  score_detail,
  process_steps,
  section1_title,
  section1_content,
  section2_title,
  section2_content,
  section3_title,
  section3_content,
  section4_title,
  section4_content,
  section5_title,
  section5_content,
  sort_order,
  is_published
)
values (
  'how-to-create-a-needs-statement',
  'WS-01',
  'How to Create a Needs Statement',
  'strategy',
  'Workshop Template · Lean Canvas Structure',
  'Use this page as the standard format for methodology pages and future workshops. This version turns a vague problem into a clear, testable needs statement your team can act on.',
  '+8',
  'When teams define needs in plain language with evidence, decision quality improves and priority drift drops.',
  '[
    {"icon":"1","label":"Frame the user and job"},
    {"icon":"2","label":"Capture the struggle"},
    {"icon":"3","label":"Write the needs statement"},
    {"icon":"4","label":"Test and refine"}
  ]'::jsonb,
  'What This Workshop Solves',
  $$<p><strong>Question:</strong> What are we trying to make clear?</p>
<p>Most teams jump from symptoms to solutions. This workshop slows that down and creates one aligned statement of need.</p>
<p><strong>Definition:</strong> A needs statement is a specific description of who is struggling, where they get stuck, and what progress they are trying to make.</p>
<ul>
  <li>Not a feature request</li>
  <li>Not a positioning slogan</li>
  <li>Not a list of ideas</li>
</ul>
<p><strong>Output:</strong> One primary needs statement plus 2 to 3 supporting evidence points.</p>$$,
  'Lean Canvas Inputs (Before the Session)',
  $$<p><strong>Question:</strong> What do we need on the table first?</p>
<p>Use this checklist to keep the workshop grounded in reality, not opinions.</p>
<ul>
  <li><strong>Customer Segment:</strong> Who exactly is experiencing the problem?</li>
  <li><strong>Top Problem Signals:</strong> What repeated friction do we observe?</li>
  <li><strong>Current Alternatives:</strong> How are they solving this today?</li>
  <li><strong>Evidence:</strong> Interviews, calls, product behavior, support logs, lost deals</li>
  <li><strong>Business Impact:</strong> Why this matters now (adoption, churn, speed, revenue)</li>
</ul>
<p><strong>Timebox:</strong> 45 to 60 minutes, 3 to 6 people, one decider.</p>$$,
  'Workshop Flow and Needs Statement Formula',
  $$<p><strong>Question:</strong> How do we write a good needs statement?</p>
<p><strong>Step 1 — Name the user context:</strong> In what moment are they trying to make progress?</p>
<p><strong>Step 2 — Name the struggle:</strong> What specific friction blocks progress today?</p>
<p><strong>Step 3 — Name desired progress:</strong> What better outcome do they want, in plain language?</p>
<p><strong>Step 4 — Add evidence:</strong> What did we see or hear that supports this?</p>
<p><strong>Recommended formula:</strong></p>
<blockquote>
<p>For <strong>[specific segment]</strong> trying to <strong>[job to be done]</strong>,<br/>
<strong>[current struggle]</strong> causes <strong>[negative impact]</strong>.<br/>
They need a way to <strong>[desired progress]</strong>, measured by <strong>[observable signal]</strong>.</p>
</blockquote>
<p><strong>Example:</strong> For operations leaders onboarding new cafe partners, inconsistent quality checks cause repeated rework and slow expansion. They need a way to standardize quality monitoring, measured by fewer escalation tickets and faster time-to-stable operations.</p>$$,
  'Facilitation Script (Run of Show)',
  $$<p><strong>Question:</strong> How should we run the room?</p>
<ol>
  <li><strong>5 min — Set scope:</strong> One segment, one context, one core struggle.</li>
  <li><strong>10 min — Evidence dump:</strong> Everyone shares concrete signals only.</li>
  <li><strong>15 min — Draft statements:</strong> Write 3 candidate statements silently.</li>
  <li><strong>10 min — Merge and tighten:</strong> Combine into one clear statement.</li>
  <li><strong>10 min — Stress test:</strong> Check clarity, evidence, and actionability.</li>
</ol>
<p><strong>Facilitator prompts:</strong></p>
<ul>
  <li>What evidence supports this exact wording?</li>
  <li>Could two people interpret this differently?</li>
  <li>Does this statement point to a decision, not just a discussion?</li>
</ul>$$,
  'Done Criteria, Artifacts, and Next Moves',
  $$<p><strong>Question:</strong> How do we know this is done?</p>
<p><strong>Quality bar:</strong></p>
<ul>
  <li>Specific user and situation are explicit</li>
  <li>Struggle is concrete and observable</li>
  <li>Desired progress is measurable</li>
  <li>Evidence is attached (not implied)</li>
  <li>Statement can guide prioritization this week</li>
</ul>
<p><strong>Artifact bundle to save:</strong></p>
<ul>
  <li>Final needs statement</li>
  <li>Rejected alternatives (and why)</li>
  <li>Evidence links</li>
  <li>Open assumptions to test next</li>
</ul>
<p><strong>What happens next:</strong> Move the approved statement into ODI needs, map related opportunities by job step, and select one route to test first.</p>$$,
  100,
  true
)
on conflict (slug) do update
set
  page_number = excluded.page_number,
  page_title = excluded.page_title,
  phase = excluded.phase,
  hero_subtitle = excluded.hero_subtitle,
  hero_description = excluded.hero_description,
  impact_score = excluded.impact_score,
  score_detail = excluded.score_detail,
  process_steps = excluded.process_steps,
  section1_title = excluded.section1_title,
  section1_content = excluded.section1_content,
  section2_title = excluded.section2_title,
  section2_content = excluded.section2_content,
  section3_title = excluded.section3_title,
  section3_content = excluded.section3_content,
  section4_title = excluded.section4_title,
  section4_content = excluded.section4_content,
  section5_title = excluded.section5_title,
  section5_content = excluded.section5_content,
  sort_order = excluded.sort_order,
  is_published = excluded.is_published,
  updated_at = now();
