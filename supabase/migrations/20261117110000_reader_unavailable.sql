-- R1 (2026-11-16): a file whose READER could not be reached says so. analyze-file writes
-- input_files.extraction_error_code = 'reader_unavailable' only when its call to the local parser itself
-- fails (connection refused, a non-2xx answer, no answer); public.unread_file_close_code then closes the file
-- with that code instead of no_text_extracted, and the signed reason renders from it ("The file reader was not
-- available when this file was uploaded. Use “Analyze again” to read it now."). no_text_extracted stays for
-- a file no read was ever attempted on, and still renders no reason.
alter table public.input_files drop constraint if exists input_files_extraction_error_code_check;
alter table public.input_files
  add constraint input_files_extraction_error_code_check check (
    extraction_error_code is null or extraction_error_code in (
      'unreadable_password', 'unreadable_corrupt', 'unreadable_empty',
      'unreadable_no_text_after_ocr', 'unreadable_format', 'ocr_unavailable',
      'reader_unavailable'
    )
  );
