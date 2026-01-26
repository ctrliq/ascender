import logging

from django.utils.timezone import now
from awx.main.models.jobs import JobTemplateMetric, JobTemplateMetricsSummary

logger = logging.getLogger('awx.main.tasks.job_template_metrics')


def _get_or_create_summary():
    """Get or create the singleton JobTemplateMetricsSummary record."""
    summary, created = JobTemplateMetricsSummary.objects.get_or_create(
        id=1,
        defaults={
            'first_job': now(),
            'last_job': now(),
        }
    )
    return summary


def update_job_template_metric(job_template_id, job_template_name):
    """
    Update or create a JobTemplateMetric when a job is executed.
    Increments the total_jobs counter and updates last_automation timestamp.
    Ensures metric name is synchronized with current job template name.
    Also updates the JobTemplateMetricsSummary.
    """
    if not job_template_id or not job_template_name:
        return
    
    try:
        from awx.main.models.jobs import JobTemplate
        # Check if job template exists first
        if not JobTemplate.objects.filter(id=job_template_id).exists():
            logger.debug(f"JobTemplate with id={job_template_id} not found, skipping metric update")
            return
        
        job_template = JobTemplate.objects.get(id=job_template_id)
        
        metric, created = JobTemplateMetric.objects.get_or_create(
            id=job_template,
            defaults={
                'name': job_template_name,
                'last_job': now(),
                'total_jobs': 1,
            }
        )
        if not created:
            # Update existing metric and sync name
            from django.db.models import F
            metric.name = job_template_name
            metric.total_jobs = F('total_jobs') + 1
            metric.last_job = now()
            metric.save(update_fields=['name', 'total_jobs', 'last_job'])
        
        # Update summary
        summary = _get_or_create_summary()
        from django.db.models import F
        
        # Set first_job if it's null (first time metrics are recorded)
        update_fields = ['total_jobs', 'last_job']
        if summary.first_job is None:
            summary.first_job = now()
            update_fields.append('first_job')
        
        summary.total_jobs = F('total_jobs') + 1
        summary.last_job = now()
        summary.save(update_fields=update_fields)
        
        logger.debug(f"Updated JobTemplateMetric for job_template_id={job_template_id}, name={job_template_name}")
    except Exception as exc:
        logger.error(f"Failed to update JobTemplateMetric: {exc}", exc_info=True)


def record_job_template_metric_duration(job_template_id, elapsed_seconds):
    """
    Record job execution duration in JobTemplateMetric.
    Updates total_seconds when a job finishes.
    Also updates the JobTemplateMetricsSummary.
    
    Args:
        job_template_id: ID of the job template
        elapsed_seconds: Total seconds the job took (rounded to nearest second)
    """
    if not job_template_id or elapsed_seconds is None:
        return
    
    try:
        metric = JobTemplateMetric.objects.filter(id=job_template_id).first()
        if metric:
            from django.db.models import F
            metric.total_seconds = F('total_seconds') + int(round(elapsed_seconds))
            metric.save(update_fields=['total_seconds'])
            
            # Update summary
            summary = _get_or_create_summary()
            summary.total_seconds = F('total_seconds') + int(round(elapsed_seconds))
            summary.save(update_fields=['total_seconds'])
            
            logger.debug(f"Recorded {elapsed_seconds}s for job_template_id={job_template_id}")
    except Exception as exc:
        logger.error(f"Failed to record job template metric duration: {exc}", exc_info=True)


def record_job_template_metric_status(job_template_id, status, elapsed_seconds=None):
    """
    Record job outcome (successful, failed, or canceled) in JobTemplateMetric.
    Increments appropriate counter and seconds based on job status.
    Also updates the JobTemplateMetricsSummary.
    
    Args:
        job_template_id: ID of the job template
        status: Job status ('successful', 'failed', 'error', or 'canceled')
        elapsed_seconds: Total seconds the job took (rounded to nearest second)
    """
    if not job_template_id or not status:
        return
    
    try:
        metric = JobTemplateMetric.objects.filter(id=job_template_id).first()
        if metric:
            from django.db.models import F
            elapsed_int = int(round(elapsed_seconds)) if elapsed_seconds else 0
            
            # Get or create summary
            summary = _get_or_create_summary()
            
            if status == 'successful':
                metric.successful_jobs = F('successful_jobs') + 1
                metric.successful_seconds = F('successful_seconds') + elapsed_int
                metric.save(update_fields=['successful_jobs', 'successful_seconds'])
                
                summary.successful_jobs = F('successful_jobs') + 1
                summary.successful_seconds = F('successful_seconds') + elapsed_int
                summary.save(update_fields=['successful_jobs', 'successful_seconds'])
                
                logger.debug(f"Recorded successful job ({elapsed_int}s) for job_template_id={job_template_id}")
            elif status == 'canceled':
                metric.canceled_jobs = F('canceled_jobs') + 1
                metric.canceled_seconds = F('canceled_seconds') + elapsed_int
                metric.save(update_fields=['canceled_jobs', 'canceled_seconds'])
                
                summary.canceled_jobs = F('canceled_jobs') + 1
                summary.canceled_seconds = F('canceled_seconds') + elapsed_int
                summary.save(update_fields=['canceled_jobs', 'canceled_seconds'])
                
                logger.debug(f"Recorded canceled job ({elapsed_int}s) for job_template_id={job_template_id}")
            elif status in ('failed', 'error'):
                metric.failed_jobs = F('failed_jobs') + 1
                metric.failed_seconds = F('failed_seconds') + elapsed_int
                metric.save(update_fields=['failed_jobs', 'failed_seconds'])
                
                summary.failed_jobs = F('failed_jobs') + 1
                summary.failed_seconds = F('failed_seconds') + elapsed_int
                summary.save(update_fields=['failed_jobs', 'failed_seconds'])
                
                logger.debug(f"Recorded failed job ({elapsed_int}s, status={status}) for job_template_id={job_template_id}")
    except Exception as exc:
        logger.error(f"Failed to record job template metric status: {exc}", exc_info=True)
