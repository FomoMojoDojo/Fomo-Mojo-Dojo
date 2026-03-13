select journey_key, step_number, step_label, has_gap, designed
from job_steps
where company_id = '537ebf27-42d2-4817-a287-dd9fe7f13a06'
order by journey_key, step_number;