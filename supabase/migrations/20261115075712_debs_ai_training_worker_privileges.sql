grant select, insert, update, delete on
  public.debs_ai_datasets,
  public.debs_ai_dataset_items,
  public.debs_ai_training_jobs,
  public.debs_ai_model_releases,
  public.debs_ai_training_events,
  public.debs_knowledge_documents
to service_role;
grant usage, select on sequence public.debs_ai_training_events_id_seq to service_role;
