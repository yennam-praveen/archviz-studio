from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .auth import current_user
from .db import get_db
from .models import Project, User
from .schemas import ProjectIn, ProjectOut, ProjectSummary

router = APIRouter(prefix="/projects", tags=["projects"])


def _owned(project_id: str, user: User, db: Session) -> Project:
    p = db.get(Project, project_id)
    # 404 for both missing and not-owned: don't leak existence of other users' projects.
    if p is None or p.owner_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    return p


@router.get("", response_model=list[ProjectSummary])
def list_projects(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return db.scalars(
        select(Project).where(Project.owner_id == user.id).order_by(Project.updated_at.desc())
    ).all()


@router.post("", response_model=ProjectSummary, status_code=201)
def create_project(body: ProjectIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = Project(owner_id=user.id, name=body.name, data=body.data)
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(project_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return _owned(project_id, user, db)


@router.put("/{project_id}", status_code=204)
def update_project(
    project_id: str, body: ProjectIn, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    p = _owned(project_id, user, db)
    p.name = body.name
    p.data = body.data
    db.commit()
    return Response(status_code=204)


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.delete(_owned(project_id, user, db))
    db.commit()
    return Response(status_code=204)
