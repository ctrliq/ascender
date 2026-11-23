package api

import (
	"context"

	"github.com/ctrliq/ascender/internal/models"
)

// DefaultExecutionEnvironmentID is get_default_execution_environment, the
// last step of every resolve_execution_environment: the
// DEFAULT_EXECUTION_ENVIRONMENT setting, else the newest global unmanaged
// execution environment with an image of GLOBAL_JOB_EXECUTION_ENVIRONMENTS,
// else the newest global unmanaged one. A read-only request looks it up
// once.
func (s *Server) DefaultExecutionEnvironmentID(ctx context.Context) *int64 {
	if n := s.Settings.Int(ctx, "DEFAULT_EXECUTION_ENVIRONMENT"); n > 0 {
		return &n
	}
	return memoized(ctx, "defaultExecutionEnvironment", func() *int64 {
		var images []string
		if global, _, err := s.defaultExecutionEnvironments(ctx); err == nil {
			for _, g := range global {
				images = append(images, g[1])
			}
		}
		return models.DefaultExecutionEnvironmentID(ctx, s.Q(), images)
	})
}

// ControlPlaneExecutionEnvironmentID is
// get_control_plane_execution_environment: the newest global managed
// execution environment.
func (s *Server) ControlPlaneExecutionEnvironmentID(ctx context.Context) *int64 {
	return memoized(ctx, "controlPlaneExecutionEnvironment", func() *int64 {
		return models.ControlPlaneExecutionEnvironmentID(ctx, s.Q())
	})
}
