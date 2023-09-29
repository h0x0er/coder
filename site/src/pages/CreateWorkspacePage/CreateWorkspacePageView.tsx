import TextField from "@mui/material/TextField";
import * as TypesGen from "api/typesGenerated";
import { UserAutocomplete } from "components/UserAutocomplete/UserAutocomplete";
import { FormikContextType, useFormik } from "formik";
import { FC, useEffect, useState } from "react";
import {
  getFormHelpers,
  nameValidator,
  onChangeTrimmed,
} from "utils/formUtils";
import * as Yup from "yup";
import { FullPageHorizontalForm } from "components/FullPageForm/FullPageHorizontalForm";
import { SelectedTemplate } from "./SelectedTemplate";
import {
  FormFields,
  FormSection,
  FormFooter,
  HorizontalForm,
} from "components/Form/Form";
import { makeStyles } from "@mui/styles";
import {
  getInitialRichParameterValues,
  useValidationSchemaForRichParameters,
} from "utils/richParameters";
import {
  ImmutableTemplateParametersSection,
  MutableTemplateParametersSection,
} from "components/TemplateParameters/TemplateParameters";
import { CreateWSPermissions } from "xServices/createWorkspace/createWorkspaceXService";
import { GitAuth } from "./GitAuth";
import { ErrorAlert } from "components/Alert/ErrorAlert";
import { Stack } from "components/Stack/Stack";
import { type GitAuthPollingState } from "./CreateWorkspacePage";

export interface CreateWorkspacePageViewProps {
  error: unknown;
  defaultName: string;
  defaultOwner: TypesGen.User;
  template: TypesGen.Template;
  versionId?: string;
  gitAuth: TypesGen.TemplateVersionExternalAuth[];
  gitAuthPollingState: GitAuthPollingState;
  startPollingGitAuth: () => void;
  parameters: TypesGen.TemplateVersionParameter[];
  defaultBuildParameters: TypesGen.WorkspaceBuildParameter[];
  permissions: CreateWSPermissions;
  creatingWorkspace: boolean;
  onCancel: () => void;
  onSubmit: (
    req: TypesGen.CreateWorkspaceRequest,
    owner: TypesGen.User,
  ) => void;
}

export const CreateWorkspacePageView: FC<CreateWorkspacePageViewProps> = ({
  error,
  defaultName,
  defaultOwner,
  template,
  versionId,
  gitAuth,
  gitAuthPollingState,
  startPollingGitAuth,
  parameters,
  defaultBuildParameters,
  permissions,
  creatingWorkspace,
  onSubmit,
  onCancel,
}) => {
  const styles = useStyles();
  const [owner, setOwner] = useState(defaultOwner);
  const { verifyGitAuth, gitAuthErrors } = useGitAuthVerification(gitAuth);
  const form: FormikContextType<TypesGen.CreateWorkspaceRequest> =
    useFormik<TypesGen.CreateWorkspaceRequest>({
      initialValues: {
        name: defaultName,
        template_id: template.id,
        rich_parameter_values: getInitialRichParameterValues(
          parameters,
          defaultBuildParameters,
        ),
      },
      validationSchema: Yup.object({
        name: nameValidator("Workspace Name"),
        rich_parameter_values: useValidationSchemaForRichParameters(parameters),
      }),
      enableReinitialize: true,
      onSubmit: (request) => {
        if (!verifyGitAuth()) {
          form.setSubmitting(false);
          return;
        }

        onSubmit(request, owner);
      },
    });

  useEffect(() => {
    if (error) {
      window.scrollTo(0, 0);
    }
  }, [error]);

  const getFieldHelpers = getFormHelpers<TypesGen.CreateWorkspaceRequest>(
    form,
    error,
  );

  return (
    <FullPageHorizontalForm title="New workspace" onCancel={onCancel}>
      <HorizontalForm onSubmit={form.handleSubmit}>
        {Boolean(error) && <ErrorAlert error={error} />}
        {/* General info */}
        <FormSection
          title="General"
          description="The template and name of your new workspace."
        >
          <FormFields>
            <SelectedTemplate template={template} />
            {versionId && versionId !== template.active_version_id && (
              <Stack spacing={1} className={styles.hasDescription}>
                <TextField
                  disabled
                  fullWidth
                  value={versionId}
                  label="Version ID"
                />
                <span className={styles.description}>
                  This parameter has been preset, and cannot be modified.
                </span>
              </Stack>
            )}
            <TextField
              {...getFieldHelpers("name")}
              disabled={form.isSubmitting}
              onChange={onChangeTrimmed(form)}
              autoFocus
              fullWidth
              label="Workspace Name"
            />
          </FormFields>
        </FormSection>

        {permissions.createWorkspaceForUser && (
          <FormSection
            title="Workspace Owner"
            description="Only admins can create workspace for other users."
          >
            <FormFields>
              <UserAutocomplete
                value={owner}
                onChange={(user) => {
                  setOwner(user ?? defaultOwner);
                }}
                label="Owner"
                size="medium"
              />
            </FormFields>
          </FormSection>
        )}

        {gitAuth && gitAuth.length > 0 && (
          <FormSection
            title="Git Authentication"
            description="This template requires authentication to automatically perform Git operations on create."
          >
            <FormFields>
              {gitAuth.map((auth) => (
                <GitAuth
                  key={auth.id}
                  authenticateURL={auth.authenticate_url}
                  authenticated={auth.authenticated}
                  gitAuthPollingState={gitAuthPollingState}
                  startPollingGitAuth={startPollingGitAuth}
                  type={auth.type}
                  error={gitAuthErrors[auth.id]}
                />
              ))}
            </FormFields>
          </FormSection>
        )}

        {parameters && (
          <>
            <MutableTemplateParametersSection
              templateParameters={parameters}
              getInputProps={(parameter, index) => {
                return {
                  ...getFieldHelpers(
                    "rich_parameter_values[" + index + "].value",
                  ),
                  onChange: async (value) => {
                    await form.setFieldValue("rich_parameter_values." + index, {
                      name: parameter.name,
                      value: value,
                    });
                  },
                  disabled: form.isSubmitting,
                };
              }}
            />
            <ImmutableTemplateParametersSection
              templateParameters={parameters}
              classes={{ root: styles.warningSection }}
              getInputProps={(parameter, index) => {
                return {
                  ...getFieldHelpers(
                    "rich_parameter_values[" + index + "].value",
                  ),
                  onChange: async (value) => {
                    await form.setFieldValue("rich_parameter_values." + index, {
                      name: parameter.name,
                      value: value,
                    });
                  },
                  disabled: form.isSubmitting,
                };
              }}
            />
          </>
        )}

        <FormFooter
          onCancel={onCancel}
          isLoading={creatingWorkspace}
          submitLabel="Create Workspace"
        />
      </HorizontalForm>
    </FullPageHorizontalForm>
  );
};

type GitAuthErrors = Record<string, string>;

const useGitAuthVerification = (
  gitAuth: TypesGen.TemplateVersionExternalAuth[],
) => {
  const [gitAuthErrors, setGitAuthErrors] = useState<GitAuthErrors>({});

  // Clear errors when gitAuth is refreshed
  useEffect(() => {
    setGitAuthErrors({});
  }, [gitAuth]);

  const verifyGitAuth = () => {
    const errors: GitAuthErrors = {};

    for (let i = 0; i < gitAuth.length; i++) {
      const auth = gitAuth.at(i);
      if (!auth) {
        continue;
      }
      if (!auth.authenticated) {
        errors[auth.id] = "You must authenticate to create a workspace!";
      }
    }

    setGitAuthErrors(errors);
    const isValid = Object.keys(errors).length === 0;
    return isValid;
  };

  return {
    gitAuthErrors,
    verifyGitAuth,
  };
};

const useStyles = makeStyles((theme) => ({
  hasDescription: {
    paddingBottom: theme.spacing(2),
  },
  description: {
    fontSize: 13,
    color: theme.palette.text.secondary,
  },
  warningText: {
    color: theme.palette.warning.light,
  },
  warningSection: {
    border: `1px solid ${theme.palette.warning.light}`,
    borderRadius: 8,
    backgroundColor: theme.palette.background.paper,
    padding: theme.spacing(10),
    marginLeft: theme.spacing(-10),
    marginRight: theme.spacing(-10),
  },
}));
